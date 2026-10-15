
(() => {
  "use strict";

  const CONFIG = window.VELOX_SUPABASE_CONFIG || {};

  if (!window.supabase || !CONFIG.url || !CONFIG.anonKey) {
    console.error("Supabase configuration is missing.");
    return;
  }

  const db = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
  const $ = (selector, root = document) => root.querySelector(selector);

  const el = {
    loginMessage: $("#loginMessage"),
    loginCard: $("#loginCard"),
    loginForm: $("#loginForm"),
    dashboard: $("#dashboard"),
    dashboardMessage: $("#dashboardMessage"),
    enquiryList: $("#enquiryList"),
    searchInput: $("#searchInput"),
    typeFilter: $("#typeFilter"),
    statusFilter: $("#statusFilter"),
    detailPanel: $("#detailPanel"),
    logoutBtn: $("#logoutBtn"),
    refreshBtn: $("#refreshBtn")
  };

  const state = {
    clients: [],
    client: null,
    requirements: [],
    projects: [],
    projectImages: [],
    teamImages: [],
    files: [],
    signedUrls: new Map()
  };

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const isEmpty = (value) => {
    if (value === null || value === undefined || value === "") return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  };

  const prettyKey = (key) =>
    String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  function formatValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";

    if (Array.isArray(value)) {
      return value.map((item) =>
        item && typeof item === "object"
          ? JSON.stringify(item, null, 2)
          : String(item)
      ).join("\n");
    }

    if (typeof value === "object") {
      return Object.entries(value)
        .map(([key, item]) =>
          `${prettyKey(key)}: ${
            item && typeof item === "object"
              ? JSON.stringify(item, null, 2)
              : String(item ?? "")
          }`
        ).join("\n");
    }

    return String(value);
  }

  function setMessage(element, message, type = "info") {
    if (!element) return;
    element.textContent = message || "";
    element.dataset.type = type;
    element.hidden = !message;
  }

  function clientName(client) {
    return client?.business_name ||
      client?.company_name ||
      client?.name ||
      client?.full_name ||
      client?.client_name ||
      client?.email ||
      "Unnamed Client";
  }

  function clientStatus(client) {
    return client?.status || client?.project_status || "pending";
  }

  function dateText(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString();
  }

  // ------------------------------------------------------
  // Styles
  // ------------------------------------------------------

  function injectStyles() {
    if ($("#velox-admin-styles")) return;

    const style = document.createElement("style");
    style.id = "velox-admin-styles";
    style.textContent = `
      .admin-detail-section {
        margin: 18px 0;
        padding: 18px;
        border: 1px solid rgba(128,128,128,.24);
        border-radius: 14px;
        min-width: 0;
      }

      .admin-detail-section h3 {
        margin: 0 0 14px;
        font-size: 1.05rem;
        line-height: 1.45;
      }

      .admin-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .admin-detail-field {
        min-width: 0;
        padding: 12px;
        border-radius: 10px;
        background: rgba(128,128,128,.07);
      }

      .admin-detail-field.full-width {
        grid-column: 1 / -1;
      }

      .admin-detail-field-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 7px;
      }

      .admin-detail-label {
        font-size: .78rem;
        font-weight: 700;
        opacity: .75;
        overflow-wrap: anywhere;
      }

      .admin-detail-value {
        margin: 0;
        font-size: .92rem;
        line-height: 1.6;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .admin-copy-btn {
        flex-shrink: 0;
        border: 1px solid rgba(128,128,128,.35);
        border-radius: 7px;
        padding: 5px 9px;
        color: inherit;
        background: transparent;
        font-size: .75rem;
        cursor: pointer;
      }

      .admin-copy-btn:hover {
        background: rgba(128,128,128,.14);
      }

      .admin-copy-all-row,
      .admin-detail-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 9px;
        margin: 12px 0;
      }

      .admin-copy-all-btn {
        border: 0;
        border-radius: 9px;
        padding: 10px 14px;
        background: #222;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }

      .admin-project-box {
        border-width: 1px;
        background: rgba(128,128,128,.025);
      }

      .admin-project-box > h3 {
        font-size: 1.12rem;
      }

      .admin-project-images-title {
        margin: 18px 0 10px;
        font-size: .92rem;
      }

      .admin-image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
        gap: 12px;
      }

      .admin-image-card {
        display: block;
        min-width: 0;
        overflow: hidden;
        border: 1px solid rgba(128,128,128,.22);
        border-radius: 11px;
        color: inherit;
        text-decoration: none;
        background: rgba(128,128,128,.05);
      }

      .admin-image-card img {
        display: block;
        width: 100%;
        height: 145px;
        object-fit: cover;
        background: rgba(128,128,128,.12);
      }

      .admin-image-caption {
        display: block;
        padding: 9px;
        font-size: .78rem;
        overflow-wrap: anywhere;
      }

      .admin-empty {
        padding: 12px;
        border-radius: 9px;
        background: rgba(128,128,128,.07);
        opacity: .8;
      }

      .admin-client-row {
        display: block;
        width: 100%;
        margin-bottom: 8px;
        padding: 13px;
        border: 1px solid rgba(128,128,128,.22);
        border-radius: 11px;
        text-align: left;
        color: inherit;
        background: transparent;
        cursor: pointer;
      }

      .admin-client-row.active,
      .admin-client-row:hover {
        background: rgba(128,128,128,.10);
      }

      .admin-client-row strong,
      .admin-client-row small {
        display: block;
        overflow-wrap: anywhere;
      }

      .admin-client-row small {
        margin-top: 5px;
        opacity: .7;
      }

      .admin-status-pill {
        display: inline-block;
        margin-top: 7px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(128,128,128,.14);
        font-size: .72rem;
      }

      .admin-note-area textarea {
        display: block;
        box-sizing: border-box;
        width: 100%;
        min-height: 95px;
        margin: 10px 0;
        padding: 10px;
        border-radius: 8px;
      }

      .admin-detail-actions button,
      .admin-detail-actions select,
      .admin-note-area button {
        max-width: 100%;
        padding: 9px 12px;
        border-radius: 8px;
      }

      @media (max-width: 620px) {
        .admin-detail-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .admin-detail-section {
          padding: 13px;
        }

        .admin-image-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .admin-image-card img {
          height: 125px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------
  // Copy support
  // ------------------------------------------------------

  async function copyText(value) {
    const text = String(value ?? "");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      console.warn("Clipboard API failed.", error);
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    let success = false;

    try {
      success = document.execCommand("copy");
    } catch (error) {
      console.error("Copy failed.", error);
    }

    textarea.remove();
    return success;
  }

  function createField(label, value, fullWidth = false) {
    if (isEmpty(value)) return null;

    const field = document.createElement("div");
    field.className = "admin-detail-field";
    if (fullWidth) field.classList.add("full-width");

    const head = document.createElement("div");
    head.className = "admin-detail-field-head";

    const labelEl = document.createElement("div");
    labelEl.className = "admin-detail-label";
    labelEl.textContent = label;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "admin-copy-btn";
    copy.textContent = "Copy";
    copy.dataset.copyText = formatValue(value);

    const content = document.createElement("div");
    content.className = "admin-detail-value";
    content.textContent = formatValue(value);

    head.append(labelEl, copy);
    field.append(head, content);

    return field;
  }

  function addDetailField(container, label, value, options = {}) {
    const fullWidth = options.fullWidth ||
      (typeof value === "object" && value !== null) ||
      formatValue(value).length > 180;

    const field = createField(label, value, fullWidth);
    if (field) container.appendChild(field);
  }

  function addDetailSection(container, title, fields) {
    const entries = Object.entries(fields || {})
      .filter(([, value]) => !isEmpty(value));

    if (!entries.length) return;

    const section = document.createElement("section");
    section.className = "admin-detail-section";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const grid = document.createElement("div");
    grid.className = "admin-detail-grid";

    entries.forEach(([key, value]) => {
      addDetailField(grid, prettyKey(key), value);
    });

    section.append(heading, grid);
    container.appendChild(section);
  }

  function addEmpty(container, message) {
    const div = document.createElement("div");
    div.className = "admin-empty";
    div.textContent = message;
    container.appendChild(div);
  }

  // Exclude technical/internal fields from visible client information.
  function cleanFields(object, excluded = []) {
    const omit = new Set([
      "id",
      "client_id",
      "created_at",
      "updated_at",
      "internal_notes",
      "logo_path",
      "password",
      "access_token",
      "refresh_token",
      "consent",
      ...excluded
    ]);

    const result = {};

    Object.entries(object || {}).forEach(([key, value]) => {
      if (omit.has(key) || isEmpty(value)) return;
      if (key.startsWith("internal_")) return;
      result[key] = value;
    });

    return result;
  }

  // ------------------------------------------------------
  // Supabase table access
  // ------------------------------------------------------

  async function getClientRows(table, clientId) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("client_id", clientId);

    if (error) {
      console.warn(`Could not load ${table}: ${error.message}`);
      return [];
    }

    return data || [];
  }

  async function loadClientDetails(client) {
    state.client = client;
    state.requirements = [];
    state.projects = [];
    state.projectImages = [];
    state.teamImages = [];
    state.files = [];

    renderClientList();

    if (!el.detailPanel) return;
    el.detailPanel.innerHTML = "";
    addEmpty(el.detailPanel, "Loading client details…");

    const [requirements, projects, teamImages, files] = await Promise.all([
      getClientRows("website_requirements", client.id),
      getClientRows("projects", client.id),
      getClientRows("team_images", client.id),
      getClientRows("client_files", client.id)
    ]);

    state.requirements = requirements;
    state.projects = projects;
    state.teamImages = teamImages;
    state.files = files;

    const projectIds = projects.map((project) => project.id).filter(Boolean);

    if (projectIds.length) {
      const { data, error } = await db
        .from("project_images")
        .select("*")
        .in("project_id", projectIds);

      if (error) {
        console.warn("Could not load project images:", error.message);
      } else {
        state.projectImages = data || [];
      }
    }

    renderDetail(client);
  }

  async function loadClients() {
    setMessage(el.dashboardMessage, "Loading clients…");

    const { data, error } = await db
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(el.dashboardMessage, `Could not load clients: ${error.message}`, "error");
      console.error(error);
      return;
    }

    state.clients = data || [];
    renderClientList();

    setMessage(
      el.dashboardMessage,
      state.clients.length
        ? `${state.clients.length} client(s) loaded.`
        : "No clients found."
    );
  }

  // ------------------------------------------------------
  // Client list
  // ------------------------------------------------------

  function renderClientList() {
    if (!el.enquiryList) return;

    const search = String(el.searchInput?.value || "").trim().toLowerCase();
    const type = String(el.typeFilter?.value || "").toLowerCase();
    const status = String(el.statusFilter?.value || "").toLowerCase();

    const filtered = state.clients.filter((client) => {
      const searchable = [
        clientName(client),
        client.email,
        client.phone,
        client.business_type,
        client.website_type,
        client.status
      ].filter(Boolean).join(" ").toLowerCase();

      if (search && !searchable.includes(search)) return false;

      if (status && status !== "all" &&
          String(clientStatus(client)).toLowerCase() !== status) {
        return false;
      }

      if (type && type !== "all") {
        const clientType = String(
          client.business_type || client.website_type || client.project_type || ""
        ).toLowerCase();

        if (clientType !== type) return false;
      }

      return true;
    });

    el.enquiryList.innerHTML = "";

    if (!filtered.length) {
      addEmpty(el.enquiryList, "No clients match the current filters.");
      return;
    }

    filtered.forEach((client) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-client-row";

      if (state.client?.id === client.id) {
        button.classList.add("active");
      }

      const name = document.createElement("strong");
      name.textContent = clientName(client);

      const email = document.createElement("small");
      email.textContent = client.email || "No email";

      const statusPill = document.createElement("span");
      statusPill.className = "admin-status-pill";
      statusPill.textContent = prettyKey(clientStatus(client));

      button.append(name, email, statusPill);
      button.addEventListener("click", () => {
        loadClientDetails(client).catch((error) => {
          console.error(error);
          setMessage(el.dashboardMessage, "Could not load client details.", "error");
        });
      });

      el.enquiryList.appendChild(button);
    });
  }

  // ------------------------------------------------------
  // Storage and image handling
  // ------------------------------------------------------

  function storagePath(row) {
    return row?.storage_path ||
      row?.file_path ||
      row?.image_path ||
      row?.logo_path ||
      row?.path ||
      "";
  }

  function storageBucket(row) {
    return row?.storage_bucket ||
      row?.bucket_name ||
      row?.bucket ||
      "client-uploads";
  }

  async function imageUrl(row) {
    const path = storagePath(row);
    if (!path) return "";

    if (/^https?:\/\//i.test(path)) return path;

    const bucket = storageBucket(row);
    const cacheKey = `${bucket}:${path}`;

    if (state.signedUrls.has(cacheKey)) {
      return state.signedUrls.get(cacheKey);
    }

    const { data, error } = await db.storage
      .from(bucket)
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      console.warn("Could not create image URL:", error?.message);
      return "";
    }

    state.signedUrls.set(cacheKey, data.signedUrl);
    return data.signedUrl;
  }

  function imageName(row, fallback = "Image") {
    return row?.original_filename ||
      row?.filename ||
      row?.file_name ||
      row?.name ||
      fallback;
  }

  function addImageCards(grid, images, fallbackName) {
    images.forEach((image) => {
      if (!image.url) return;

      const link = document.createElement("a");
      link.className = "admin-image-card";
      link.href = image.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.name || fallbackName;
      img.loading = "lazy";
      img.decoding = "async";

      const caption = document.createElement("span");
      caption.className = "admin-image-caption";
      caption.textContent = image.name || fallbackName;

      link.append(img, caption);
      grid.appendChild(link);
    });
  }

  async function renderGallery(container, title, rows) {
    if (!rows?.length) return;

    const resolved = await Promise.all(rows.map(async (row) => ({
      url: await imageUrl(row),
      name: imageName(row, title)
    })));

    const images = resolved.filter((image) => image.url);
    if (!images.length) return;

    const section = document.createElement("section");
    section.className = "admin-detail-section";

    const heading = document.createElement("h3");
    heading.textContent = `${title} (${images.length})`;

    const grid = document.createElement("div");
    grid.className = "admin-image-grid";

    addImageCards(grid, images, title);
    section.append(heading, grid);
    container.appendChild(section);
  }

  // ------------------------------------------------------
  // Design preferences
  // ------------------------------------------------------

  function renderDesignPreferences(container) {
    const keywords = [
      "design",
      "style",
      "colour",
      "color",
      "font",
      "layout",
      "reference",
      "inspiration",
      "moodboard",
      "mood_board",
      "website_example",
      "preferred",
      "visual",
      "theme",
      "branding",
      "brand",
      "aesthetic"
    ];

    const fields = {};

    state.requirements.forEach((requirement, index) => {
      Object.entries(requirement || {}).forEach(([key, value]) => {
        if (isEmpty(value)) return;

        const normalized = key.toLowerCase();
        if (!keywords.some((word) => normalized.includes(word))) return;

        const label = state.requirements.length > 1
          ? `Requirement ${index + 1} — ${prettyKey(key)}`
          : prettyKey(key);

        fields[label] = value;
      });
    });

    if (state.client?.brand_colours && !isEmpty(state.client.brand_colours)) {
      fields["Brand Colours"] = state.client.brand_colours;
    }

    if (state.client?.website_style && !isEmpty(state.client.website_style)) {
      fields["Website Style"] = state.client.website_style;
    }

    if (state.client?.design_description && !isEmpty(state.client.design_description)) {
      fields["Design Description"] = state.client.design_description;
    }

    if (Object.keys(fields).length) {
      addDetailSection(container, "Design Preferences", fields);
    }
  }

  // ------------------------------------------------------
  // Project cards with images inside each project
  // ------------------------------------------------------

  async function renderProjects(container) {
    if (!state.projects.length) {
      addEmpty(container, "No projects have been added.");
      return;
    }

    for (let index = 0; index < state.projects.length; index++) {
      const project = state.projects[index];

      const box = document.createElement("section");
      box.className = "admin-detail-section admin-project-box";

      const heading = document.createElement("h3");
      heading.textContent = project.project_name || `Project ${index + 1}`;

      const details = {
        "Project Type": project.project_type,
        "Description": project.description,
        "Location": project.location,
        "Completion Date": dateText(project.completion_date),
        "Outcome": project.outcome,
        "Reference URL": project.reference_url
      };

      const grid = document.createElement("div");
      grid.className = "admin-detail-grid";

      Object.entries(details).forEach(([label, value]) => {
        addDetailField(grid, label, value, {
          fullWidth: label === "Description"
        });
      });

      box.append(heading, grid);

      const projectImages = state.projectImages.filter(
        (image) => String(image.project_id) === String(project.id)
      );

      const imageHeading = document.createElement("h4");
      imageHeading.className = "admin-project-images-title";
      imageHeading.textContent = `Project Images (${projectImages.length})`;

      const imageGrid = document.createElement("div");
      imageGrid.className = "admin-image-grid";

      box.append(imageHeading, imageGrid);
      container.appendChild(box);

      if (!projectImages.length) {
        addEmpty(imageGrid, "No images uploaded for this project.");
        continue;
      }

      const resolved = await Promise.all(projectImages.map(async (image) => ({
        url: await imageUrl(image),
        name: imageName(image, project.project_name || "Project image")
      })));

      const validImages = resolved.filter((image) => image.url);

      if (!validImages.length) {
        addEmpty(imageGrid, "Images could not be loaded. Check storage permissions.");
      } else {
        addImageCards(imageGrid, validImages, project.project_name || "Project image");
      }
    }
  }

  // ------------------------------------------------------
  // Status and notes
  // ------------------------------------------------------

  function renderStatusControls(container, client) {
    const section = document.createElement("section");
    section.className = "admin-detail-section";

    const heading = document.createElement("h3");
    heading.textContent = "Update Status";

    const actions = document.createElement("div");
    actions.className = "admin-detail-actions";

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Client status");

    const statuses = [
      "pending",
      "contacted",
      "in_progress",
      "review",
      "completed",
      "cancelled"
    ];

    if (!statuses.includes(clientStatus(client))) {
      statuses.push(clientStatus(client));
    }

    statuses.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = prettyKey(status);
      option.selected = status === clientStatus(client);
      select.appendChild(option);
    });

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save Status";

    const message = document.createElement("span");
    message.setAttribute("role", "status");

    save.addEventListener("click", async () => {
      save.disabled = true;
      message.textContent = "Saving…";

      try {
        const { error } = await db
          .from("clients")
          .update({ status: select.value })
          .eq("id", client.id);

        if (error) throw error;

        client.status = select.value;
        const original = state.clients.find((item) => item.id === client.id);
        if (original) original.status = select.value;

        message.textContent = "Status updated.";
        renderClientList();
      } catch (error) {
        console.error(error);
        message.textContent = `Update failed: ${error.message}`;
      } finally {
        save.disabled = false;
      }
    });

    actions.append(select, save, message);
    section.append(heading, actions);
    container.appendChild(section);
  }

  function renderNotes(container, client) {
    const section = document.createElement("section");
    section.className = "admin-detail-section admin-note-area";

    const heading = document.createElement("h3");
    heading.textContent = "Internal Notes";

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Write internal notes…";
    textarea.value = client.internal_notes || "";

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save Notes";

    const message = document.createElement("span");
    message.setAttribute("role", "status");

    save.addEventListener("click", async () => {
      save.disabled = true;
      message.textContent = "Saving…";

      try {
        const { error } = await db
          .from("clients")
          .update({ internal_notes: textarea.value })
          .eq("id", client.id);

        if (error) throw error;

        client.internal_notes = textarea.value;

        const original = state.clients.find((item) => item.id === client.id);
        if (original) original.internal_notes = textarea.value;

        message.textContent = "Notes saved.";
      } catch (error) {
        console.error(error);
        message.textContent = `Save failed: ${error.message}`;
      } finally {
        save.disabled = false;
      }
    });

    section.append(heading, textarea, save, message);
    container.appendChild(section);
  }

  // ------------------------------------------------------
  // Copy all details — excludes buttons and Raw Answers
  // ------------------------------------------------------

  function buildAllDetailsText(client) {
    const lines = [`Client: ${clientName(client)}`];

    function addObject(title, object) {
      const fields = cleanFields(object);
      const entries = Object.entries(fields);
      if (!entries.length) return;

      lines.push("", `=== ${title} ===`);

      entries.forEach(([key, value]) => {
        lines.push(`${prettyKey(key)}: ${formatValue(value)}`);
      });
    }

    addObject("Client Information", client);

    state.requirements.forEach((requirement, index) => {
      addObject(
        state.requirements.length > 1
          ? `Website Requirements ${index + 1}`
          : "Website Requirements",
        requirement
      );
    });

    state.projects.forEach((project, index) => {
      addObject(
        state.projects.length > 1
          ? `Project ${index + 1}`
          : "Project Details",
        project
      );

      const images = state.projectImages.filter(
        (image) => String(image.project_id) === String(project.id)
      );

      if (images.length) {
        lines.push("Project Images:");
        images.forEach((image) => lines.push(imageName(image, "Project image")));
      }
    });

    return lines.join("\n");
  }

  // ------------------------------------------------------
  // Main detail renderer — no Raw Answers section
  // ------------------------------------------------------

  async function renderDetail(client) {
    const container = el.detailPanel;
    if (!container) return;

    container.innerHTML = "";

    const header = document.createElement("section");
    header.className = "admin-detail-section";

    const title = document.createElement("h2");
    title.textContent = clientName(client);

    const email = document.createElement("p");
    email.className = "admin-detail-value";
    email.textContent = client.email || "";

    header.append(title, email);
    container.appendChild(header);

    const copyRow = document.createElement("div");
    copyRow.className = "admin-copy-all-row";

    const copyAll = document.createElement("button");
    copyAll.type = "button";
    copyAll.className = "admin-copy-all-btn";
    copyAll.textContent = "Copy All Details";

    copyAll.addEventListener("click", async () => {
      const success = await copyText(buildAllDetailsText(client));
      copyAll.textContent = success ? "Copied!" : "Copy failed";
      window.setTimeout(() => {
        copyAll.textContent = "Copy All Details";
      }, 1400);
    });

    copyRow.appendChild(copyAll);
    container.appendChild(copyRow);

    addDetailSection(
      container,
      "Client Information",
      cleanFields(client)
    );

   
    // Each project and its images stay in the same box.
    await renderProjects(container);

    // Separate galleries for non-project images and client uploads.
    if (client.logo_path) {
      await renderGallery(container, "Company Logo", [{
        storage_path: client.logo_path,
        original_filename: "Company logo"
      }]);
    }

    await renderGallery(container, "Team Images", state.teamImages);
    await renderGallery(container, "Client Uploads", state.files);

    renderStatusControls(container, client);
    renderNotes(container, client);

    // Event delegation: one handler per render, copy field buttons only.
    container.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy-text]");
      if (!button || !container.contains(button)) return;

      const original = button.textContent;
      const success = await copyText(button.dataset.copyText || "");
      button.textContent = success ? "Copied!" : "Failed";

      window.setTimeout(() => {
        button.textContent = original;
      }, 1200);
    }, { once: true });
  }

  // ------------------------------------------------------
  // Authentication
  // ------------------------------------------------------

  function showUI(loggedIn) {
    if (el.loginCard) el.loginCard.hidden = loggedIn;
    if (el.dashboard) el.dashboard.hidden = !loggedIn;
  }

  async function login(event) {
    event.preventDefault();

    const email = el.loginForm?.querySelector(
      'input[type="email"], input[name="email"]'
    )?.value.trim();

    const password = el.loginForm?.querySelector(
      'input[type="password"], input[name="password"]'
    )?.value;

    if (!email || !password) {
      setMessage(el.loginMessage, "Enter your email and password.", "error");
      return;
    }

    const submit = el.loginForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submit) submit.disabled = true;
    setMessage(el.loginMessage, "Signing in…");

    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMessage(el.loginMessage, "");
    } catch (error) {
      setMessage(el.loginMessage, error.message || "Login failed.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function logout() {
    if (el.logoutBtn) el.logoutBtn.disabled = true;

    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;

      state.clients = [];
      state.client = null;

      if (el.enquiryList) el.enquiryList.innerHTML = "";
      if (el.detailPanel) el.detailPanel.innerHTML = "";

      showUI(false);
    } catch (error) {
      setMessage(el.dashboardMessage, error.message, "error");
    } finally {
      if (el.logoutBtn) el.logoutBtn.disabled = false;
    }
  }

  async function initialise() {
    injectStyles();

    el.loginForm?.addEventListener("submit", login);
    el.logoutBtn?.addEventListener("click", logout);
    el.refreshBtn?.addEventListener("click", () => {
      loadClients().catch(console.error);
    });

    el.searchInput?.addEventListener("input", renderClientList);
    el.typeFilter?.addEventListener("change", renderClientList);
    el.statusFilter?.addEventListener("change", renderClientList);

    const { data, error } = await db.auth.getSession();

    if (error) {
      setMessage(el.loginMessage, error.message, "error");
      showUI(false);
      return;
    }

    showUI(Boolean(data.session));

    if (data.session) {
      await loadClients();
    }

    db.auth.onAuthStateChange((_event, session) => {
      showUI(Boolean(session));

      if (session) {
        loadClients().catch(console.error);
      } else {
        state.clients = [];
        state.client = null;
        if (el.enquiryList) el.enquiryList.innerHTML = "";
        if (el.detailPanel) el.detailPanel.innerHTML = "";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initialise().catch((error) => {
      console.error("Admin dashboard failed to initialise:", error);
      setMessage(
        el.dashboardMessage,
        "Dashboard could not start. Check Supabase configuration and browser console.",
        "error"
      );
    });
  });
})();
