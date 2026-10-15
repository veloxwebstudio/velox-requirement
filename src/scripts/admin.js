(() => {
  "use strict";

  // ==========================================
  // VELOX WEB STUDIO - ADMIN DASHBOARD
  // Hides empty fields and empty sections
  // ==========================================

  const $ = (id) => document.getElementById(id);

  const cfg = window.VELOX_SUPABASE_CONFIG;

  if (!window.supabase || !cfg?.url || !cfg?.anonKey) {
    console.error("Supabase configuration is missing.");
    const message = $("loginMessage");
    if (message) {
      message.textContent =
        "Configuration error. Please check config.js and script order.";
    }
    return;
  }

  const supabase = window.supabase.createClient(
    cfg.url,
    cfg.anonKey
  );

  const BUCKET = "client-uploads";

  const state = {
    clients: [],
    requirements: [],
    projects: [],
    projectImages: [],
    teamImages: [],
    clientFiles: [],
    selectedClientId: null
  };

  // ------------------------------------------
  // Helpers
  // ------------------------------------------

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function isFilled(value) {
    if (value === null || value === undefined) return false;

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.some(isFilled);
    }

    if (typeof value === "object") {
      return Object.values(value).some(isFilled);
    }

    // Keep valid values such as 0 and false.
    return true;
  }

  function prettyLabel(key) {
    return String(key)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatValue(value) {
    if (!isFilled(value)) return "";

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (Array.isArray(value)) {
      return value
        .filter(isFilled)
        .map((item) =>
          typeof item === "object"
            ? JSON.stringify(item)
            : String(item)
        )
        .join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  function getValue(obj, keys) {
    for (const key of keys) {
      if (isFilled(obj?.[key])) return obj[key];
    }
    return null;
  }

  function getClientId(row) {
    return row?.client_id ?? row?.clientId ?? null;
  }

  function getRecordId(row) {
    return row?.id ?? row?.client_id ?? null;
  }

  function showMessage(elementId, message, isError = false) {
    const el = $(elementId);
    if (!el) return;

    el.textContent = message || "";
    el.style.color = isError ? "#dc2626" : "";
  }

  function setHTML(elementId, html) {
    const el = $(elementId);
    if (el) el.innerHTML = html;
  }

  function showElement(element, visible) {
    if (element) {
      element.hidden = !visible;
    }
  }

  function addDetailField(label, value, options = {}) {
    // Main rule: don't render empty values.
    if (!isFilled(value)) return "";

    const displayValue = formatValue(value);
    if (!isFilled(displayValue)) return "";

    const isLong = options.long === true ||
      String(displayValue).length > 180;

    return `
      <div class="admin-detail-field">
        <div class="admin-detail-label">
          ${escapeHTML(label)}
        </div>
        <div class="admin-detail-value${isLong ? " is-long" : ""}">
          ${escapeHTML(displayValue)}
        </div>
      </div>
    `;
  }

  function addDetailSection(title, fieldsHTML) {
    // Don't render sections with no filled fields.
    if (!isFilled(fieldsHTML)) return "";

    return `
      <section class="admin-detail-section">
        <h3>${escapeHTML(title)}</h3>
        <div class="admin-detail-grid">
          ${fieldsHTML}
        </div>
      </section>
    `;
  }

  function getStatus(row) {
    return getValue(row, ["status", "project_status"]) || "new";
  }

  function normaliseStatus(status) {
    return String(status || "new")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ");
  }

  function dateLabel(value) {
    if (!isFilled(value)) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString();
  }

  // ------------------------------------------
  // Auth
  // ------------------------------------------

  async function checkSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Session error:", error);
    }

    const loggedIn = Boolean(data?.session);

    showElement($("loginCard"), !loggedIn);
    showElement($("dashboard"), loggedIn);

    if (loggedIn) {
      await loadDashboard();
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const form = $("loginForm");
    if (!form) return;

    const emailInput = form.querySelector(
      'input[type="email"], input[name="email"]'
    );

    const passwordInput = form.querySelector(
      'input[type="password"], input[name="password"]'
    );

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showMessage("loginMessage", "Enter your email and password.", true);
      return;
    }

    showMessage("loginMessage", "Signing in...");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage("loginMessage", error.message, true);
      return;
    }

    showMessage("loginMessage", "");
    await checkSession();
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error);
      showMessage("dashboardMessage", error.message, true);
      return;
    }

    state.clients = [];
    state.requirements = [];
    state.projects = [];
    state.projectImages = [];
    state.teamImages = [];
    state.clientFiles = [];
    state.selectedClientId = null;

    showElement($("loginCard"), true);
    showElement($("dashboard"), false);
    showMessage("loginMessage", "");
  }

  // ------------------------------------------
  // Supabase data loading
  // ------------------------------------------

  async function fetchTable(tableName) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*");

    if (error) {
      console.warn(`Could not load ${tableName}:`, error.message);
      return [];
    }

    return data || [];
  }

  async function loadDashboard() {
    showMessage("dashboardMessage", "Loading enquiries...");

    try {
      const results = await Promise.all([
        fetchTable("clients"),
        fetchTable("website_requirements"),
        fetchTable("projects"),
        fetchTable("project_images"),
        fetchTable("team_images"),
        fetchTable("client_files")
      ]);

      [
        state.clients,
        state.requirements,
        state.projects,
        state.projectImages,
        state.teamImages,
        state.clientFiles
      ] = results;

      renderEnquiryList();

      if (state.selectedClientId !== null) {
        const stillExists = state.clients.some(
          (client) =>
            String(getRecordId(client)) ===
            String(state.selectedClientId)
        );

        if (stillExists) {
          await renderDetail(state.selectedClientId);
        } else {
          state.selectedClientId = null;
          setHTML("detailPanel", "");
        }
      }

      showMessage(
        "dashboardMessage",
        `${state.clients.length} client record(s) loaded.`
      );
    } catch (error) {
      console.error("Dashboard loading error:", error);
      showMessage(
        "dashboardMessage",
        error.message || "Could not load dashboard data.",
        true
      );
    }
  }

  // ------------------------------------------
  // Find related records
  // ------------------------------------------

  function getRequirementsForClient(client) {
    const clientId = getRecordId(client);

    return state.requirements.filter((row) => {
      return String(getClientId(row)) === String(clientId);
    });
  }

  function getProjectsForClient(client) {
    const clientId = getRecordId(client);

    return state.projects.filter((project) => {
      return String(getClientId(project)) === String(clientId);
    });
  }

  function getProjectImages(project) {
    const projectId = getRecordId(project);

    return state.projectImages.filter((image) => {
      return String(
        image.project_id ?? image.projectId ?? ""
      ) === String(projectId);
    });
  }

  function getClientFiles(client) {
    const clientId = getRecordId(client);

    return state.clientFiles.filter((file) => {
      return String(getClientId(file)) === String(clientId);
    });
  }

  function getTeamImages(client) {
    const clientId = getRecordId(client);

    return state.teamImages.filter((image) => {
      return String(getClientId(image)) === String(clientId);
    });
  }

  function getPrimaryRequirement(client) {
    return getRequirementsForClient(client)[0] || {};
  }

  // ------------------------------------------
  // Enquiry list and filters
  // ------------------------------------------

  function renderEnquiryList() {
    const container = $("enquiryList");
    if (!container) return;

    const search = ($("searchInput")?.value || "")
      .trim()
      .toLowerCase();

    const typeFilter = $("typeFilter")?.value || "";
    const statusFilter = $("statusFilter")?.value || "";

    const filtered = state.clients.filter((client) => {
      const req = getPrimaryRequirement(client);

      const name = getValue(client, [
        "name", "full_name", "business_name", "company_name"
      ]) || getValue(req, ["name", "full_name", "business_name"]) || "";

      const email = getValue(client, ["email"]) ||
        getValue(req, ["email"]) || "";

      const phone = getValue(client, [
        "phone", "whatsapp", "phone_number"
      ]) || getValue(req, [
        "phone", "whatsapp", "phone_number"
      ]) || "";

      const searchable = `${name} ${email} ${phone}`.toLowerCase();

      if (search && !searchable.includes(search)) return false;

      const type = getValue(req, [
        "website_type", "project_type", "business_type", "site_type"
      ]) || "";

      if (typeFilter && String(type) !== typeFilter) return false;

      const status = normaliseStatus(getStatus(req));

      if (
        statusFilter &&
        status !== normaliseStatus(statusFilter)
      ) {
        return false;
      }

      return true;
    });

    if (!filtered.length) {
      container.innerHTML = `
        <div class="admin-empty-state">
          No matching enquiries found.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((client) => {
      const req = getPrimaryRequirement(client);

      const name = getValue(client, [
        "name", "full_name", "business_name", "company_name"
      ]) || getValue(req, [
        "name", "full_name", "business_name"
      ]) || "Unnamed client";

      const email = getValue(client, ["email"]) ||
        getValue(req, ["email"]) || "";

      const type = getValue(req, [
        "website_type", "project_type", "business_type", "site_type"
      ]) || "";

      const status = getStatus(req);

      const selected =
        String(state.selectedClientId) ===
        String(getRecordId(client));

      return `
        <button
          type="button"
          class="admin-enquiry-item${selected ? " is-selected" : ""}"
          data-client-id="${escapeHTML(getRecordId(client))}"
        >
          <strong>${escapeHTML(name)}</strong>
          ${isFilled(email)
            ? `<span>${escapeHTML(email)}</span>`
            : ""}
          ${isFilled(type)
            ? `<span>${escapeHTML(type)}</span>`
            : ""}
          <span class="admin-status">
            ${escapeHTML(prettyLabel(status))}
          </span>
        </button>
      `;
    }).join("");

    container.querySelectorAll("[data-client-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.clientId;
        state.selectedClientId = id;

        renderEnquiryList();
        await renderDetail(id);
      });
    });
  }

  // ------------------------------------------
  // Client details
  // ------------------------------------------

  async function renderDetail(id) {
    const container = $("detailPanel");
    if (!container) return;

    const client = state.clients.find(
      (item) => String(getRecordId(item)) === String(id)
    );

    if (!client) {
      container.innerHTML = "";
      return;
    }

    const req = getPrimaryRequirement(client);
    const allRequirements = getRequirementsForClient(client);
    const projects = getProjectsForClient(client);
    const clientFiles = getClientFiles(client);
    const teamImages = getTeamImages(client);

    const name = getValue(client, [
      "name", "full_name", "business_name", "company_name"
    ]) || getValue(req, [
      "name", "full_name", "business_name"
    ]) || "Client details";

    // Client information: only filled values appear.
    let contactFields = "";

    const contactSources = [
      { source: client, keys: ["email"], label: "Email" },
      { source: client, keys: ["phone", "phone_number"], label: "Phone" },
      { source: client, keys: ["whatsapp", "whatsapp_number"], label: "WhatsApp" },
      { source: client, keys: ["business_name", "company_name"], label: "Business Name" },
      { source: client, keys: ["website", "website_url"], label: "Website" },
      { source: client, keys: ["instagram", "instagram_url"], label: "Instagram" },
      { source: client, keys: ["facebook", "facebook_url"], label: "Facebook" },
      { source: client, keys: ["tiktok", "tiktok_url"], label: "TikTok" },
      { source: client, keys: ["address", "location"], label: "Address" },
      { source: client, keys: ["created_at"], label: "Created" }
    ];

    for (const item of contactSources) {
      const value = getValue(item.source, item.keys);
      contactFields += addDetailField(
        item.label,
        item.label === "Created" ? dateLabel(value) : value
      );
    }

    // Some forms save contact fields in website_requirements.
    const requirementContactFields = [
      { keys: ["email"], label: "Email" },
      { keys: ["phone", "phone_number"], label: "Phone" },
      { keys: ["whatsapp", "whatsapp_number"], label: "WhatsApp" },
      { keys: ["instagram", "instagram_url"], label: "Instagram" },
      { keys: ["facebook", "facebook_url"], label: "Facebook" },
      { keys: ["website", "website_url"], label: "Website" }
    ];

    for (const item of requirementContactFields) {
      const alreadyHasValue = getValue(client, item.keys);
      const reqValue = getValue(req, item.keys);

      if (!isFilled(alreadyHasValue) && isFilled(reqValue)) {
        contactFields += addDetailField(item.label, reqValue);
      }
    }

    // About / description.
    let aboutFields = "";
    aboutFields += addDetailField(
      "Description",
      getValue(client, [
        "description", "about", "business_description"
      ]) || getValue(req, [
        "description", "about", "business_description"
      ]),
      { long: true }
    );

    aboutFields += addDetailField(
      "Business Category",
      getValue(client, [
        "category", "business_category", "industry"
      ]) || getValue(req, [
        "category", "business_category", "industry"
      ])
    );

    aboutFields += addDetailField(
      "Target Audience",
      getValue(req, ["target_audience", "audience"]),
      { long: true }
    );

    aboutFields += addDetailField(
      "Main Goal",
      getValue(req, ["main_goal", "website_goal", "goal"]),
      { long: true }
    );

    // Requirements: render only known, filled answers.
    let requirementFields = "";

    const requirementFieldMap = [
      { keys: ["website_type", "project_type", "site_type"], label: "Website Type" },
      { keys: ["business_type"], label: "Business Type" },
      { keys: ["pages", "required_pages", "website_pages"], label: "Required Pages" },
      { keys: ["features", "required_features", "website_features"], label: "Features" },
      { keys: ["design_style", "style_preference", "design_preference"], label: "Design Style" },
      { keys: ["color_preference", "preferred_colors", "brand_colors"], label: "Color Preference" },
      { keys: ["reference_websites", "inspiration_links", "competitor_websites"], label: "Reference Websites" },
      { keys: ["content_ready", "content_status"], label: "Content Ready" },
      { keys: ["domain_status", "has_domain"], label: "Domain Status" },
      { keys: ["hosting_status", "has_hosting"], label: "Hosting Status" },
      { keys: ["timeline", "deadline", "delivery_timeline"], label: "Timeline" },
      { keys: ["custom_budget", "budget", "budget_range"], label: "Budget" },
      { keys: ["additional_notes", "notes", "message", "requirements"], label: "Additional Notes" }
    ];

    for (const item of requirementFieldMap) {
      requirementFields += addDetailField(
        item.label,
        getValue(req, item.keys),
        { long: true }
      );
    }

    // Render any other filled requirement fields not listed above.
    const knownRequirementKeys = new Set([
      "id", "client_id", "created_at", "updated_at",
      "status", "internal_notes", "admin_notes",
      ...requirementFieldMap.flatMap((item) => item.keys)
    ]);

    if (req && typeof req === "object") {
      Object.entries(req).forEach(([key, value]) => {
        if (knownRequirementKeys.has(key)) return;
        if (/_id$/.test(key)) return;
        if (!isFilled(value)) return;

        requirementFields += addDetailField(
          prettyLabel(key),
          value,
          { long: true }
        );
      });
    }

    // Projects: don't show the section if there are no projects.
    let projectSections = "";

    for (const project of projects) {
      let fields = "";

      fields += addDetailField(
        "Project Name",
        getValue(project, ["title", "name", "project_name"])
      );

      fields += addDetailField(
        "Project Type",
        getValue(project, ["type", "project_type", "website_type"])
      );

      fields += addDetailField(
        "Project URL",
        getValue(project, ["url", "website_url", "live_url"])
      );

      fields += addDetailField(
        "Description",
        getValue(project, ["description", "details", "summary"]),
        { long: true }
      );

      fields += addDetailField(
        "Status",
        getValue(project, ["status", "project_status"])
      );

      fields += addDetailField(
        "Start Date",
        dateLabel(getValue(project, ["start_date"]))
      );

      fields += addDetailField(
        "Completed Date",
        dateLabel(getValue(project, ["completed_at", "completed_date"]))
      );

      if (isFilled(fields)) {
        projectSections += `
          <div class="admin-project-card">
            ${fields}
          </div>
        `;
      }
    }

    // Image helper.
    async function getImageURL(file) {
      const directURL = getValue(file, [
        "public_url", "image_url", "url"
      ]);

      if (
        isFilled(directURL) &&
        /^https?:\/\//i.test(String(directURL))
      ) {
        return directURL;
      }

      const path = getValue(file, [
        "storage_path", "file_path", "image_path", "path"
      ]);

      if (!isFilled(path)) return "";

      // Support an already-complete storage path.
      const cleanPath = String(path).replace(/^\/+/, "");

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(cleanPath, 60 * 60);

      if (error) {
        console.warn("Could not create image URL:", error.message);
        return "";
      }

      return data?.signedUrl || "";
    }

    async function renderImageGroup(title, files) {
      // Hide empty galleries completely.
      if (!Array.isArray(files) || files.length === 0) return "";

      const cards = await Promise.all(files.map(async (file) => {
        const url = await getImageURL(file);

        // Don't show files with no usable URL.
        if (!url) return "";

        const filename = getValue(file, [
          "original_filename", "file_name", "filename", "name"
        ]) || "Uploaded image";

        return `
          <a
            class="admin-image-card"
            href="${escapeHTML(url)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="${escapeHTML(url)}"
              alt="${escapeHTML(filename)}"
              loading="lazy"
            />
            <span>${escapeHTML(filename)}</span>
          </a>
        `;
      }));

      const validCards = cards.filter(isFilled).join("");

      if (!validCards) return "";

      return `
        <section class="admin-detail-section">
          <h3>${escapeHTML(title)}</h3>
          <div class="admin-image-grid">
            ${validCards}
          </div>
        </section>
      `;
    }

    // Logo: support a storage path or an existing public URL.
    let logoHTML = "";
    const logoPath = getValue(client, ["logo_path", "logo_url"]);

    if (isFilled(logoPath)) {
      const logoURL = await getImageURL({
        storage_path: logoPath,
        public_url: /^https?:\/\//i.test(String(logoPath))
          ? logoPath
          : null
      });

      if (logoURL) {
        logoHTML = `
          <img
            class="admin-client-logo"
            src="${escapeHTML(logoURL)}"
            alt="${escapeHTML(name)} logo"
          />
        `;
      }
    }

    // Gather gallery groups, then hide any group without valid images.
    const logoGroupHTML = logoHTML
      ? `<section class="admin-detail-section">
           <h3>Business Logo</h3>
           ${logoHTML}
         </section>`
      : "";

    const clientImagesHTML = await renderImageGroup(
      "Client Uploads",
      clientFiles
    );

    const teamImagesHTML = await renderImageGroup(
      "Team Images",
      teamImages
    );

    let projectImagesHTML = "";

    for (const project of projects) {
      const images = getProjectImages(project);

      const projectName = getValue(project, [
        "title", "name", "project_name"
      ]) || "Project Images";

      projectImagesHTML += await renderImageGroup(
        projectName,
        images
      );
    }

    // Enquiry management remains visible even if other data is empty.
    const currentStatus = getStatus(req);
    const internalNotes = getValue(req, [
      "internal_notes", "admin_notes"
    ]) || "";

    const statusOptions = [
      ["new", "New"],
      ["contacted", "Contacted"],
      ["in_progress", "In Progress"],
      ["completed", "Completed"],
      ["cancelled", "Cancelled"]
    ];

    const notesFieldName = req.internal_notes !== undefined
      ? "internal_notes"
      : "admin_notes";

    const reqId = getRecordId(req);

    const manageHTML = `
      <section class="admin-detail-section admin-manage-section">
        <h3>Manage Enquiry</h3>

        <form id="manageEnquiryForm" data-requirement-id="${
          escapeHTML(reqId ?? "")
        }">
          <label for="adminStatus">Status</label>
          <select id="adminStatus" name="status">
            ${statusOptions.map(([value, label]) => `
              <option
                value="${escapeHTML(value)}"
                ${normaliseStatus(currentStatus) ===
                  normaliseStatus(value) ? "selected" : ""}
              >${escapeHTML(label)}</option>
            `).join("")}
          </select>

          <label for="adminInternalNotes">Internal Notes</label>
          <textarea
            id="adminInternalNotes"
            name="internal_notes"
            rows="4"
            placeholder="Write private admin notes..."
          >${escapeHTML(internalNotes)}</textarea>

          <button type="submit" id="saveEnquiryBtn">
            Save Changes
          </button>

          <p id="saveEnquiryMessage" role="status"></p>
        </form>
      </section>
    `;

    const submittedDate = getValue(req, ["created_at"]) ||
      getValue(client, ["created_at"]);

    const submittedHTML = isFilled(submittedDate)
      ? `<p class="admin-submitted-date">
           Submitted: ${escapeHTML(dateLabel(submittedDate))}
         </p>`
      : "";

    // Add only sections with filled data.
    const sectionsHTML = [
      addDetailSection("Contact Information", contactFields),
      addDetailSection("About the Business", aboutFields),
      addDetailSection("Website Requirements", requirementFields),
      addDetailSection("Projects", projectSections),
      logoGroupHTML,
      clientImagesHTML,
      teamImagesHTML,
      projectImagesHTML
    ].filter(isFilled).join("");

    container.innerHTML = `
      <div class="admin-detail-header">
        <div>
          <h2>${escapeHTML(name)}</h2>
          ${submittedHTML}
        </div>
        ${logoHTML ? "" : ""}
      </div>

      ${sectionsHTML}

      ${manageHTML}
    `;

    const manageForm = $("manageEnquiryForm");

    if (manageForm) {
      manageForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const saveButton = $("saveEnquiryBtn");
        const message = $("saveEnquiryMessage");

        if (!reqId) {
          if (message) {
            message.textContent =
              "No website requirement record exists for this client.";
          }
          return;
        }

        const newStatus = $("adminStatus")?.value;
        const newNotes = $("adminInternalNotes")?.value?.trim() || "";

        if (saveButton) saveButton.disabled = true;
        if (message) message.textContent = "Saving...";

        const updateData = {
          status: newStatus
        };

        updateData[notesFieldName] = newNotes;

        const { error } = await supabase
          .from("website_requirements")
          .update(updateData)
          .eq("id", reqId);

        if (saveButton) saveButton.disabled = false;

        if (error) {
          console.error("Save error:", error);
          if (message) {
            message.textContent = `Save failed: ${error.message}`;
          }
          return;
        }

        if (message) message.textContent = "Changes saved successfully.";

        // Update local data so filters and details remain in sync.
        const localReq = state.requirements.find(
          (item) => String(getRecordId(item)) === String(reqId)
        );

        if (localReq) {
          localReq.status = newStatus;
          localReq[notesFieldName] = newNotes;
        }

        renderEnquiryList();
      });
    }
  }

  // ------------------------------------------
  // Event listeners
  // ------------------------------------------

  $("loginForm")?.addEventListener("submit", handleLogin);
  $("logoutBtn")?.addEventListener("click", handleLogout);
  $("refreshBtn")?.addEventListener("click", loadDashboard);

  $("searchInput")?.addEventListener("input", renderEnquiryList);
  $("typeFilter")?.addEventListener("change", renderEnquiryList);
  $("statusFilter")?.addEventListener("change", renderEnquiryList);

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showElement($("loginCard"), true);
      showElement($("dashboard"), false);
    }

    if (event === "SIGNED_IN" && session) {
      showElement($("loginCard"), false);
      showElement($("dashboard"), true);
    }
  });

  // ------------------------------------------
  // Small styling improvements
  // ------------------------------------------

  if (!$("adminDashboardStyles")) {
    const style = document.createElement("style");
    style.id = "adminDashboardStyles";

    style.textContent = `
      .admin-detail-section {
        margin: 20px 0;
        padding: 18px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
      }

      .admin-detail-section h3 {
        margin: 0 0 14px;
      }

      .admin-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .admin-detail-field {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .admin-detail-label {
        margin-bottom: 5px;
        color: #6b7280;
        font-size: 12px;
        font-weight: 600;
      }

      .admin-detail-value {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .admin-detail-value.is-long {
        grid-column: 1 / -1;
      }

      .admin-project-card {
        padding: 14px 0;
        border-bottom: 1px solid #e5e7eb;
      }

      .admin-project-card:last-child {
        border-bottom: 0;
      }

      .admin-image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 12px;
      }

      .admin-image-card {
        display: block;
        min-width: 0;
        color: inherit;
        text-decoration: none;
      }

      .admin-image-card img {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1;
        object-fit: cover;
        border-radius: 8px;
      }

      .admin-image-card span {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        overflow-wrap: anywhere;
      }

      .admin-client-logo {
        display: block;
        max-width: 180px;
        max-height: 100px;
        object-fit: contain;
        margin: 10px 0;
      }

      .admin-manage-section form {
        display: grid;
        gap: 10px;
      }

      .admin-manage-section input,
      .admin-manage-section select,
      .admin-manage-section textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 10px;
      }

      .admin-empty-state {
        padding: 20px;
        color: #6b7280;
      }

      .admin-enquiry-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
        width: 100%;
        padding: 14px;
        margin-bottom: 8px;
        text-align: left;
        cursor: pointer;
      }

      .admin-enquiry-item.is-selected {
        outline: 2px solid #6366f1;
      }

      .admin-status {
        font-size: 12px;
        font-weight: 600;
      }

      @media (max-width: 600px) {
        .admin-detail-grid {
          grid-template-columns: 1fr;
        }

        .admin-detail-section {
          padding: 13px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ------------------------------------------
  // Start
  // ------------------------------------------

  checkSession().catch((error) => {
    console.error("Admin initialization error:", error);
    showMessage(
      "loginMessage",
      "Could not initialize admin dashboard. Check the browser console.",
      true
    );
  });
})();

