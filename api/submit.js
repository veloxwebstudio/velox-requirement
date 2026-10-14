const formidable = require("formidable");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = "client-uploads";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

function reply(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function one(value) { return Array.isArray(value) ? value[0] : value; }
function safeName(name) {
  return String(name || "upload").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "upload";
}
function parseForm(req) {
  const form = formidable({
    multiples: true,
    maxFileSize: MAX_FILE_BYTES,
    maxTotalFileSize: 40 * 1024 * 1024,
    maxFields: 200,
    maxFieldsSize: 2 * 1024 * 1024,
    allowEmptyFiles: false,
    minFileSize: 1
  });
  return new Promise((resolve, reject) => form.parse(req, (err, fields, files) => err ? reject(err) : resolve({fields, files})));
}
function fileList(files, field) {
  const value = files[field];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
function validUpload(file, isLogo = false) {
  const type = String(file.mimetype || "");
  const name = String(file.originalFilename || "");
  const svgByName = isLogo && /\.svg$/i.test(name);
  const allowed = isLogo ? (LOGO_TYPES.has(type) || svgByName) : IMAGE_TYPES.has(type);
  const max = isLogo ? LOGO_MAX_BYTES : MAX_FILE_BYTES;
  if (!allowed) throw new Error(`Unsupported file type for ${name || "upload"}.`);
  if (Number(file.size) > max) throw new Error(`${name || "Upload"} exceeds the file-size limit.`);
  return true;
}
async function uploadFile(supabase, clientId, file, category) {
  validUpload(file, category === "logo");
  const original = safeName(file.originalFilename);
  const path = `${clientId}/${category}/${crypto.randomUUID()}-${original}`;
  const fs = require("fs");
  const body = await fs.promises.readFile(file.filepath);
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: file.mimetype || "application/octet-stream",
    upsert: false,
    metadata: { original_filename: original }
  });
  if (error) throw new Error(`Could not save ${original}: ${error.message}`);
  return {
    storage_path: path,
    original_filename: original,
    mime_type: file.mimetype || null,
    file_size: Number(file.size) || 0,
    image_type: category
  };
}
function validatePayload(data) {
  const required = ["company_name", "business_type", "contact_name", "email", "about_description", "budget_amount", "currency"];
  for (const key of required) {
    if (!String(data[key] ?? "").trim()) throw new Error(`Please provide ${key.replaceAll("_", " ")}.`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) throw new Error("Please provide a valid email address.");
  if (!Number.isFinite(Number(data.budget_amount)) || Number(data.budget_amount) < 0) throw new Error("Please provide a valid budget amount.");
  if (!data.consent) throw new Error("Consent is required before submitting.");
  if (!Array.isArray(data.projects)) data.projects = [];
  if (data.projects.length > 30) throw new Error("Please submit no more than 30 project entries at once.");
  for (const project of data.projects) {
    if (!String(project.project_name || "").trim() || !String(project.description || "").trim()) {
      throw new Error("Each project needs a name and description.");
    }
  }
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(res, 405, { error: "Method not allowed." });
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return reply(res, 500, { error: "The server is not configured. Please contact the website owner." });

  let uploadedPaths = [];
  let clientId = null;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { fields, files } = await parseForm(req);
    const rawPayload = one(fields.payload);
    if (!rawPayload || typeof rawPayload !== "string" || rawPayload.length > 1_500_000) throw new Error("Invalid form payload.");
    const data = JSON.parse(rawPayload);
    validatePayload(data);

    // Small in-memory guard against rapid repeats. Use a durable rate limiter/CAPTCHA for high-volume production.
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    global.__veloxRate = global.__veloxRate || new Map();
    const now = Date.now();
    const recent = (global.__veloxRate.get(ip) || []).filter(t => now - t < 60_000);
    if (recent.length >= 5) return reply(res, 429, { error: "Too many submissions. Please wait a minute and try again." });
    recent.push(now); global.__veloxRate.set(ip, recent);

    const { data: client, error: clientError } = await supabase.from("clients").insert({
      company_name: String(data.company_name).trim(),
      business_type: data.business_type,
      contact_name: String(data.contact_name).trim(),
      email: String(data.email).trim().toLowerCase(),
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      country: data.country || null,
      city: data.city || null,
      address: data.address || null,
      website_url: data.website_url || null,
      social_links: {
        instagram: data.instagram_url || "",
        facebook: data.facebook_url || "",
        linkedin: data.linkedin_url || "",
        other: data.other_social || ""
      },
      about_description: data.about_description,
      founding_year: data.founding_year ? Number(data.founding_year) : null,
      experience: data.experience ? Number(data.experience) : null,
      differentiators: data.differentiators || null,
      certifications: data.certifications || null,
      achievements: data.achievements || null,
      service_areas: data.service_areas || null
    }).select("id").single();
    if (clientError) throw new Error(`Could not save client details: ${clientError.message}`);
    clientId = client.id;

    const logo = fileList(files, "logo")[0];
    if (logo) {
      const stored = await uploadFile(supabase, clientId, logo, "logo");
      uploadedPaths.push(stored.storage_path);
      const { error } = await supabase.from("clients").update({ logo_path: stored.storage_path }).eq("id", clientId);
      if (error) throw new Error(`Could not save logo details: ${error.message}`);
      await supabase.from("client_files").insert({ client_id: clientId, ...stored });
    }

    for (const file of fileList(files, "team_images")) {
      const stored = await uploadFile(supabase, clientId, file, "team");
      uploadedPaths.push(stored.storage_path);
      const { error } = await supabase.from("team_images").insert({ client_id: clientId, ...stored });
      if (error) throw new Error(`Could not save team image details: ${error.message}`);
    }

    const { error: reqError } = await supabase.from("website_requirements").insert({
      client_id: clientId,
      website_type: data.website_type,
      selected_pages: data.pages || [],
      home_sections: data.home_sections || [],
      about_sections: data.about_sections || [],
      portfolio_sections: data.portfolio_sections || [],
      selected_features: data.features || [],
      design_preferences: {
        brand_colours: data.brand_colours || "",
        website_style: data.website_style || "",
        liked_websites: data.liked_websites || "",
        design_description: data.design_description || "",
        domain_name: data.domain_name || "",
        hosting_status: data.hosting_status || "",
        content_status: data.content_status || "",
        images_status: data.images_status || "",
        other_features: data.other_features || "",
        product_count: data.product_count || "",
        product_categories: data.product_categories || "",
        payment_requirements: data.payment_requirements || "",
        booking_type: data.booking_type || "",
        booking_functionality: data.booking_functionality || "",
        other_currency: data.other_currency || ""
      },
      reference_urls: data.reference_urls || null,
      custom_budget: Number(data.budget_amount),
      currency: data.currency === "Other" ? (data.other_currency || "Other") : data.currency,
      budget_notes: data.budget_notes || null,
      additional_notes: data.additional_requirements || null,
      status: "New",
      raw_answers: data
    });
    if (reqError) throw new Error(`Could not save website requirements: ${reqError.message}`);

    for (let i = 0; i < data.projects.length; i++) {
      const project = data.projects[i];
      const { data: savedProject, error: projectError } = await supabase.from("projects").insert({
        client_id: clientId,
        project_name: project.project_name,
        project_type: project.project_type || null,
        description: project.description,
        location: project.location || null,
        completion_date: project.completion_date || null,
        outcome: project.outcome || null,
        reference_url: project.reference_url || null
      }).select("id").single();
      if (projectError) throw new Error(`Could not save project ${i + 1}: ${projectError.message}`);

      const projectImages = [
        ...fileList(files, `project_${i}_images`).map(f => ({file:f, type:"project"})),
        ...fileList(files, `project_${i}_before`).map(f => ({file:f, type:"before"})),
        ...fileList(files, `project_${i}_after`).map(f => ({file:f, type:"after"}))
      ];
      for (const item of projectImages) {
        const stored = await uploadFile(supabase, clientId, item.file, `projects/${savedProject.id}/${item.type}`);
        uploadedPaths.push(stored.storage_path);
        const { error: imageError } = await supabase.from("project_images").insert({
          project_id: savedProject.id, client_id: clientId, ...stored, image_type: item.type
        });
        if (imageError) throw new Error(`Could not save project image metadata: ${imageError.message}`);
      }
    }

    return reply(res, 201, { ok: true, reference: clientId.slice(0, 8).toUpperCase() });
  } catch (error) {
    // Best-effort compensation cleanup for any files already uploaded.
    if (uploadedPaths.length) {
      try { await supabase.storage.from(BUCKET).remove(uploadedPaths); } catch {}
    }
    if (clientId) {
      try { await supabase.from("clients").delete().eq("id", clientId); } catch {}
    }
    const status = /payload|provide|consent|project entries|Each project|unsupported file|file-size|too large|valid budget|valid email/i.test(error.message) ? 400 : 500;
    return reply(res, status, { error: status === 400 ? error.message : "We couldn't save your submission. Please try again or contact the website owner." });
  }
};