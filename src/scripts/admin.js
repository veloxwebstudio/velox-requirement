
(() => {
  "use strict";

  const cfg = window.VELOX_SUPABASE_CONFIG || {};

  const loginCard = document.querySelector("#loginCard");
  const dashboard = document.querySelector("#dashboard");
  const loginForm = document.querySelector("#loginForm");
  const loginMessage = document.querySelector("#loginMessage");
  const dashboardMessage = document.querySelector("#dashboardMessage");
  const logoutBtn = document.querySelector("#logoutBtn");
  const list = document.querySelector("#enquiryList");
  const detail = document.querySelector("#detailPanel");
  const refreshBtn = document.querySelector("#refreshBtn");
  const searchInput = document.querySelector("#searchInput");
  const typeFilter = document.querySelector("#typeFilter");
  const statusFilter = document.querySelector("#statusFilter");

  let supabase = null;
  let allClients = [];
  let requirements = [];
  let projects = [];
  let projectImages = [];
  let teamImages = [];
  let clientFiles = [];
  let selectedId = null;
  let loadingData = false;

  function setMessage(el, message, error = false) {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
  }

  function node(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) {
      el.textContent = String(text);
    }
    return el;
  }

  function value(obj, key) {
    const v = obj?.[key];

    if (v === null || v === undefined || v === "") return "—";
    if (Array.isArray(v)) return v.join(", ") || "—";

    if (typeof v === "object") {
      return JSON.stringify(v, null, 2);
    }

    return String(v);
  }

  function statusFor(clientId) {
    return requirements.find(r => r.client_id === clientId) || {};
  }

  function budgetLabel(req) {
    if (req.custom_budget == null) return "Budget not set";

    return `${req.currency || ""} ${Number(
      req.custom_budget
    ).toLocaleString()}`.trim();
  }

  function showLogin() {
    if (loginCard) loginCard.hidden = false;
    if (dashboard) dashboard.hidden = true;
    if (logoutBtn) logoutBtn.hidden = true;
  }

  async function showDashboard() {
    if (!dashboard || !loginCard) return;

    loginCard.hidden = true;
    dashboard.hidden = false;

    if (logoutBtn) logoutBtn.hidden = false;

    await loadData();
  }

  async function init() {
    if (!loginCard || !dashboard || !loginForm || !loginMessage) {
      console.error(
        "Admin login elements are missing. Check admin.html element IDs."
      );
      return;
    }

    if (
      !window.supabase ||
      !cfg.url ||
      cfg.url.includes("YOUR_PROJECT_ID") ||
      !cfg.anonKey ||
      cfg.anonKey.includes("YOUR_SUPABASE")
    ) {
      showLogin();
      setMessage(
        loginMessage,
        "Supabase config missing. Check src/scripts/config.js.",
        true
      );
      return;
    }

    try {
      supabase = window.supabase.createClient(cfg.url, cfg.anonKey);

      supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          showLogin();
        }
      });

      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (data?.session) {
        await showDashboard();
      } else {
        showLogin();
      }
    } catch (error) {
      console.error("Admin initialization failed:", error);
      showLogin();
      setMessage(
        loginMessage,
        "Could not connect to Supabase: " + error.message,
        true
      );
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!supabase) {
      setMessage(loginMessage, "Supabase is not configured.", true);
      return;
    }

    const submitButton = loginForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      setMessage(loginMessage, "Enter your email and password.", true);
      return;
    }

    if (submitButton) submitButton.disabled = true;
    setMessage(loginMessage, "Signing in...");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      loginForm.reset();
      setMessage(loginMessage, "");

      await showDashboard();
    } catch (error) {
      console.error("Login failed:", error);
      setMessage(loginMessage, error.message || "Login failed.", true);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (!supabase) return;

      logoutBtn.disabled = true;

      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        showLogin();
      } catch (error) {
        setMessage(
          dashboardMessage,
          "Logout failed: " + error.message,
          true
        );
      } finally {
        logoutBtn.disabled = false;
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      void loadData();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", renderList);
  }

  if (typeFilter) {
    typeFilter.addEventListener("change", renderList);
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", renderList);
  }

  async function loadData() {
    if (!supabase || loadingData) return;

    loadingData = true;

    if (list) {
      list.replaceChildren(node("div", "empty", "Loading enquiries..."));
    }

    setMessage(dashboardMessage, "");

    try {
      const [
        clientsRes,
        reqRes,
        projRes,
        projectImgRes,
        teamImgRes,
        clientFileRes
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("website_requirements")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("project_images")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("team_images")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("client_files")
          .select("*")
          .order("created_at", { ascending: false })
      ]);

      const error =
        clientsRes.error ||
        reqRes.error ||
        projRes.error ||
        projectImgRes.error ||
        teamImgRes.error ||
        clientFileRes.error;

      if (error) throw error;

      allClients = clientsRes.data || [];
      requirements = reqRes.data || [];
      projects = projRes.data || [];
      projectImages = projectImgRes.data || [];
      teamImages = teamImgRes.data || [];
      clientFiles = clientFileRes.data || [];

      if (typeFilter) {
        const currentType = typeFilter.value;

        typeFilter.replaceChildren(
          new Option("All business types", "")
        );

        [
          ...new Set(
            allClients.map(c => c.business_type).filter(Boolean)
          )
        ]
          .sort()
          .forEach(type => {
            typeFilter.add(new Option(type, type));
          });

        typeFilter.value = currentType;
      }

      renderList();

      if (selectedId && allClients.some(c => c.id === selectedId)) {
        await renderDetail(selectedId);
      } else if (allClients.length) {
        await renderDetail(allClients[0].id);
      } else if (detail) {
        detail.replaceChildren(
          node("div", "empty", "No enquiries have been submitted yet.")
        );
      }

      setMessage(
        dashboardMessage,
        `${allClients.length} client ${
          allClients.length === 1 ? "enquiry" : "enquiries"
        } loaded.`
      );
    } catch (error) {
      console.error("Dashboard data loading failed:", error);

      setMessage(
        dashboardMessage,
        "Could not load dashboard data: " + error.message +
          ". Check your Supabase RLS policies and table permissions.",
        true
      );

      if (list) {
        list.replaceChildren(
          node("div", "empty", "Could not load data.")
        );
      }
    } finally {
      loadingData = false;
    }
  }

  function renderList() {
    if (!list) return;

    const search = (searchInput?.value || "").toLowerCase().trim();
    const type = typeFilter?.value || "";
    const status = statusFilter?.value || "";

    const filtered = allClients.filter(client => {
      const req = statusFor(client.id);

      const searchable = [
        client.company_name,
        client.email,
        client.contact_name
      ].join(" ").toLowerCase();

      return (
        (!search || searchable.includes(search)) &&
        (!type || client.business_type === type) &&
        (!status || (req.status || "New") === status)
      );
    });

    list.replaceChildren();

    if (!filtered.length) {
      list.append(
        node("div", "empty", "No enquiries match these filters.")
      );
      return;
    }

    filtered.forEach(client => {
      const req = statusFor(client.id);
      const button = node(
        "button",
        "enquiry-item" +
          (selectedId === client.id ? " selected" : "")
      );

      button.type = "button";

      button.append(
        node("strong", "", client.company_name || "Untitled company"),
        node(
          "small",
          "",
          `${client.contact_name || "No contact"} · ${
            client.email || "No email"
          }`
        )
      );

      const meta = node("div", "enquiry-meta");

      meta.append(
        node("span", "status-pill", req.status || "New"),
        node("span", "budget", budgetLabel(req))
      );

      button.append(meta);

      button.addEventListener("click", async () => {
        selectedId = client.id;
        renderList();
        await renderDetail(client.id);
      });

      list.append(button);
    });
  }

  function addDetailField(grid, label, val, wide = false) {
    const item = node(
      "div",
      "detail-field" + (wide ? " wide" : "")
    );

    item.append(
      node("small", "", label),
      node("strong", "", value({ v: val }, "v"))
    );

    grid.append(item);
  }

  function addSection(parent, title, content) {
    const section = node("section", "detail-section");
    section.append(node("h3", "", title));

    if (typeof content === "string") {
      section.append(node("p", "", content || "—"));
    } else {
      section.append(content);
    }

    parent.append(section);
  }

  async function renderImageGroup(parent, title, files) {
    const group = node("div", "admin-image-group");
    group.style.marginBottom = "24px";

    group.append(node("h4", "", title));

    if (!files.length) {
      group.append(node("p", "empty", "No images uploaded."));
      parent.append(group);
      return;
    }

    const imageGrid = node("div", "admin-image-grid");

    imageGrid.style.display = "grid";
    imageGrid.style.gridTemplateColumns =
      "repeat(auto-fill, minmax(130px, 1fr))";
    imageGrid.style.gap = "12px";

    group.append(imageGrid);
    parent.append(group);

    for (const file of files) {
      if (!file.storage_path) continue;

      const card = node("div", "admin-image-card");
      card.style.minWidth = "0";

      const img = document.createElement("img");
      img.alt = file.original_filename || title;
      img.loading = "lazy";
      img.style.display = "block";
      img.style.width = "100%";
      img.style.height = "130px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "10px";
      img.style.background = "#f2f2f2";

      const caption = node(
        "small",
        "",
        `${file.image_type || "Image"} · ${
          file.original_filename || "Uploaded image"
        }`
      );

      caption.style.display = "block";
      caption.style.marginTop = "6px";
      caption.style.overflowWrap = "anywhere";

      card.append(img, caption);
      imageGrid.append(card);

      try {
        const { data, error } = await supabase.storage
          .from("client-uploads")
          .createSignedUrl(file.storage_path, 300);

        if (error || !data?.signedUrl) {
          caption.textContent =
            `${file.original_filename || "Image"} — preview unavailable`;
          img.alt = "Image preview unavailable";
          continue;
        }

        img.src = data.signedUrl;
        img.style.cursor = "pointer";

        img.addEventListener("click", () => {
          window.open(
            data.signedUrl,
            "_blank",
            "noopener,noreferrer"
          );
        });

        img.addEventListener("error", () => {
          caption.textContent = "Image could not be displayed.";
        });
      } catch (error) {
        console.error("Image preview failed:", error);
        caption.textContent = "Image preview unavailable.";
      }
    }
  }

  async function renderDetail(id) {
    selectedId = id;

    const client = allClients.find(item => item.id === id);
    if (!client || !detail) return;

    const req = statusFor(id);

    detail.replaceChildren();

    const top = node("div", "detail-top");
    const title = node("div");

    title.append(
      node("h2", "", client.company_name || "Untitled company"),
      node(
        "p",
        "",
        `${client.contact_name || ""} · ${client.email || ""}`
      )
    );

    top.append(
      title,
      node("span", "status-pill", req.status || "New")
    );

    detail.append(top);

    const grid = node("div", "detail-fields");

    [
      ["Business type", client.business_type],
      ["Email", client.email],
      ["Phone", client.phone],
      ["WhatsApp", client.whatsapp],
      ["Country", client.country],
      ["City", client.city],
      ["Address", client.address],
      ["Website", client.website_url],
      ["Instagram", client.social_links?.instagram],
      ["Facebook", client.social_links?.facebook],
      ["LinkedIn", client.social_links?.linkedin],
      ["Founded", client.founding_year],
      ["Experience", client.experience],
      ["Service areas", client.service_areas],
      ["Certifications", client.certifications],
      ["Achievements", client.achievements]
    ].forEach(([label, val]) => {
      addDetailField(grid, label, val);
    });

    detail.append(grid);

    addSection(detail, "About the company", client.about_description);
    addSection(
      detail,
      "What makes the company different",
      client.differentiators
    );

    const projectRows = projects.filter(
      project => project.client_id === id
    );

    const projectBox = node("div");

    if (!projectRows.length) {
      projectBox.append(node("p", "", "No projects provided."));
    }

    projectRows.forEach(project => {
      const block = node("div");
      block.style.marginBottom = "16px";

      block.append(
        node("strong", "", project.project_name || "Project"),
        node("p", "", project.description || ""),
        node(
          "p",
          "",
          `Type: ${project.project_type || "—"} · Location: ${
            project.location || "—"
          }\nOutcome: ${project.outcome || "—"}`
        )
      );

      projectBox.append(block);
    });

    addSection(detail, "Recent projects", projectBox);

    const fileBox = node("div");
    const relatedProjectIds = projectRows.map(project => project.id);

    // Files stored in client_files.
    const relatedFiles = clientFiles
      .filter(file => file.client_id === id)
      .map(file => ({
        ...file,
        display_type:
          file.image_type === "logo" ||
          file.storage_path?.includes("/logo/")
            ? "Company logo"
            : "Client file"
      }));

    // Logo can be stored only in clients.logo_path.
    if (
      client.logo_path &&
      !relatedFiles.some(
        file => file.storage_path === client.logo_path
      )
    ) {
      relatedFiles.unshift({
        client_id: id,
        storage_path: client.logo_path,
        original_filename: "Company logo",
        image_type: "logo",
        display_type: "Company logo"
      });
    }

    const teamFiles = teamImages
      .filter(file => file.client_id === id)
      .map(file => ({
        ...file,
        display_type: "Team / workplace image"
      }));

    const projectFiles = projectImages
      .filter(
        file =>
          file.client_id === id &&
          relatedProjectIds.includes(file.project_id)
      )
      .map(file => ({
        ...file,
        display_type: `Project ${file.image_type || ""} image`.trim()
      }));

    const logoFiles = relatedFiles.filter(
      file =>
        file.image_type === "logo" ||
        file.storage_path?.includes("/logo/") ||
        file.display_type === "Company logo"
    );

    const otherClientFiles = relatedFiles.filter(
      file => !logoFiles.includes(file)
    );

    await renderImageGroup(fileBox, "Company Logo", logoFiles);
    await renderImageGroup(
      fileBox,
      "Team / Workplace Images",
      teamFiles
    );

    for (let index = 0; index < projectRows.length; index++) {
      const project = projectRows[index];

      const filesForProject = projectFiles.filter(
        file => file.project_id === project.id
      );

      await renderImageGroup(
        fileBox,
        `Project ${index + 1}: ${
          project.project_name || "Untitled project"
        }`,
        filesForProject
      );
    }

    if (otherClientFiles.length) {
      await renderImageGroup(
        fileBox,
        "Other Uploaded Files",
        otherClientFiles
      );
    }

    addSection(detail, "Client Images & Project Gallery", fileBox);

    const reqBox = node("div");

    [
      ["Project type", req.website_type],
      ["Pages", req.selected_pages],
      ["Home sections", req.home_sections],
      ["About sections", req.about_sections],
      ["Portfolio sections", req.portfolio_sections],
      ["Features", req.selected_features],
      ["Budget", budgetLabel(req)],
      ["Reference URLs", req.reference_urls],
      ["Design preferences", req.design_preferences],
      ["Additional notes", req.additional_notes]
    ].forEach(([label, val]) => {
      const row = node("div");
      row.style.marginBottom = "12px";

      row.append(
        node("small", "", label),
        node("p", "", value({ v: val }, "v"))
      );

      reqBox.append(row);
    });

    addSection(detail, "Website requirements", reqBox);

    // Manage enquiry
    const editSection = node("section", "detail-section");
    editSection.append(node("h3", "", "Manage enquiry"));

    const statusLabel = node("label", "", "Status");
    const statusSelect = document.createElement("select");

    [
      "New",
      "Reviewing",
      "Contacted",
      "Quoted",
      "In Progress",
      "Completed",
      "Rejected"
    ].forEach(status => {
      statusSelect.add(new Option(status, status));
    });

    statusSelect.value = req.status || "New";
    statusLabel.append(statusSelect);
    editSection.append(statusLabel);

    const notesLabel = node("label", "", "Internal notes");
    const notes = document.createElement("textarea");

    notes.placeholder = "Private notes for your team...";
    notes.value = req.internal_notes || "";

    notesLabel.append(notes);
    editSection.append(notesLabel);

    const save = node("button", "btn primary", "Save status and notes");
    save.type = "button";

    save.addEventListener("click", async () => {
      save.disabled = true;
      save.textContent = "Saving...";

      try {
        const { error } = await supabase
          .from("website_requirements")
          .update({
            status: statusSelect.value,
            internal_notes: notes.value
          })
          .eq("client_id", id);

        if (error) throw error;

        const existing = requirements.find(
          item => item.client_id === id
        );

        if (existing) {
          existing.status = statusSelect.value;
          existing.internal_notes = notes.value;
        }

        setMessage(
          dashboardMessage,
          "Status and notes updated successfully."
        );

        renderList();
      } catch (error) {
        console.error("Saving enquiry failed:", error);

        setMessage(
          dashboardMessage,
          "Could not update enquiry: " + error.message,
          true
        );
      } finally {
        save.disabled = false;
        save.textContent = "Save status and notes";
      }
    });

    editSection.append(save);
    detail.append(editSection);
  }

  void init();
})();
