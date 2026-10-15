
(() => {
  "use strict";

  const CONFIG = window.VELOX_SUPABASE_CONFIG || {};
  const supabaseUrl = CONFIG.url;
  const supabaseKey = CONFIG.anonKey;

  if (!window.supabase || !supabaseUrl || !supabaseKey) {
    console.error(
      "Supabase is not configured. Check the Supabase CDN and VELOX_SUPABASE_CONFIG."
    );
    return;
  }

  const db = window.supabase.createClient(supabaseUrl, supabaseKey);

  const $ = (selector, root = document) => root.querySelector(selector);

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const prettyKey = (key) =>
    String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const isEmpty = (value) => {
    if (value === null || value === undefined || value === "") return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return "";

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (Array.isArray(value)) {
      return value.map((item) => {
        if (item && typeof item === "object") {
          return JSON.stringify(item, null, 2);
        }
        return String(item);
      }).join("\n");
    }

    if (typeof value === "object") {
      return Object.entries(value)
        .map(([key, item]) => {
          const formatted = typeof item === "object" && item !== null
            ? JSON.stringify(item, null, 2)
            : String(item ?? "");
          return `${prettyKey(key)}: ${formatted}`;
        })
        .join("\n");
    }

    return String(value);
  };

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getClientName = (client) =>
    client?.business_name ||
    client?.company_name ||
    client?.name ||
    client?.full_name ||
    client?.client_name ||
    client?.email ||
    "Unnamed Client";

  const getClientEmail = (client) =>
    client?.email || client?.contact_email || "";

  const getClientStatus = (client) =>
    client?.status || client?.project_status || "pending";

  const setMessage = (element, message, type = "info") => {
    if (!element) return;

    element.textContent = message;
    element.dataset.type = type;
    element.hidden = !message;
  };

  const statusOptions = [
    "pending",
    "contacted",
    "in_progress",
    "review",
    "completed",
    "cancelled"
  ];

  const statusLabel = (status) =>
    prettyKey(status || "pending");

  const imageExtensions = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;

  const looksLikeImage = (value, row = {}) => {
    const type = String(
      row.image_type ||
      row.file_type ||
      row.mime_type ||
      row.content_type ||
      ""
    ).toLowerCase();

    const name = String(
      row.original_filename ||
      row.filename ||
      row.file_name ||
      row.name ||
      value ||
      ""
    );

    return type.startsWith("image/") || imageExtensions.test(name);
  };

  const state = {
    clients: [],
    selectedClient: null,
    selectedRequirements: [],
    selectedProjects: [],
    selectedProjectImages: [],
    selectedTeamImages: [],
    selectedFiles: [],
    signedUrlCache: new Map(),
    busy: false
  };

  const elements = {
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

  // -------------------------------------------------------
  // Inject styles without replacing the existing HTML design
  // -------------------------------------------------------

  function injectStyles() {
    if ($("#velox-admin-extra-styles")) return;

    const style = document.createElement("style");
    style.id = "velox-admin-extra-styles";

    style.textContent = `
      .admin-detail-section {
        margin: 18px 0;
        padding: 18px;
        border: 1px solid rgba(128,128,128,.22);
        border-radius: 14px;
        min-width: 0;
      }

      .admin-detail-section h3 {
        margin: 0 0 15px;
        font-size: 1.05rem;
        line-height: 1.4;
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
        gap: 10px;
        margin-bottom: 7px;
      }

      .admin-detail-label {
        font-size: .78rem;
        font-weight: 700;
        opacity: .75;
        overflow-wrap: anywhere;
      }

      .admin-detail-value {
        font-size: .92rem;
        line-height: 1.6;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        margin: 0;
      }

      .admin-copy-btn {
        flex: 0 0 auto;
        border: 1px solid rgba(128,128,128,.35);
        border-radius: 7px;
        padding: 5px 9px;
        background: transparent;
        color: inherit;
        font-size: .75rem;
        cursor: pointer;
      }

      .admin-copy-btn:hover {
        background: rgba(128,128,128,.15);
      }

      .admin-copy-all-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 14px 0;
      }

      .admin-copy-all-btn {
        border: 0;
        border-radius: 9px;
        padding: 10px 14px;
        background: #202020;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }

      .admin-image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
        gap: 13px;
      }

      .admin-image-card {
        display: block;
        min-width: 0;
        overflow: hidden;
        border: 1px solid rgba(128,128,128,.22);
        border-radius: 12px;
        color: inherit;
        text-decoration: none;
        background: rgba(128,128,128,.05);
        transition: transform .18s ease, box-shadow .18s ease;
      }

      .admin-image-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 5px 18px rgba(0,0,0,.10);
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
        line-height: 1.4;
        overflow-wrap: anywhere;
      }

      .admin-empty {
        padding: 14px;
        border-radius: 10px;
        background: rgba(128,128,128,.07);
        opacity: .8;
      }

      .admin-client-row {
        display: block;
        width: 100%;
        padding: 13px;
        margin-bottom: 8px;
        border: 1px solid rgba(128,128,128,.2);
        border-radius: 11px;
        text-align: left;
        color: inherit;
        background: transparent;
        cursor: pointer;
      }

      .admin-client-row:hover,
      .admin-client-row.active {
        background: rgba(128,128,128,.10);
        border-color: rgba(128,128,128,.55);
      }

      .admin-client-row strong,
      .admin-client-row small {
        display: block;
        overflow-wrap: anywhere;
      }

      .admin-client-row small {
        margin-top: 5px;
        opacity: .72;
      }

      .admin-status-pill {
        display: inline-block;
        margin-top: 8px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(128,128,128,.13);
        font-size: .72rem;
      }

      .admin-detail-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 9px;
        margin: 12px 0;
      }

      .admin-detail-actions select,
      .admin-detail-actions button,
      .admin-note-area textarea {
        max-width: 100%;
        padding: 9px 11px;
        border-radius: 8px;
      }

      .admin-note-area textarea {
        display: block;
        width: 100%;
        min-height: 90px;
        margin: 8px 0;
        box-sizing: border-box;
      }

      .admin-link {
        overflow-wrap: anywhere;
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
          height: 130px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // -------------------------------------------------------
  // Copy helpers
  // -------------------------------------------------------

  async function copyText(text) {
    const content = String(text ?? "");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
        return true;
      }
    } catch (error) {
      console.warn("Clipboard API unavailable; trying fallback.", error);
    }

    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;

    try {
      copied = document.execCommand("copy");
    } catch (error) {
      console.error("Copy failed.", error);
    }

    textarea.remove();
    return copied;
  }

  function createCopyButton(text, label = "Copy") {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "admin-copy-btn";
    button.textContent = label;
    button.dataset.copyText = String(text ?? "");
    button.setAttribute("aria-label", `${label} text`);

    return button;
  }

  function createField(label, value, options = {}) {
    if (isEmpty(value)) return null;

    const field = document.createElement("div");
    field.className = "admin-detail-field";

    if (options.fullWidth) {
      field.classList.add("full-width");
    }

    const head = document.createElement("div");
    head.className = "admin-detail-field-head";

    const labelElement = document.createElement("div");
    labelElement.className = "admin-detail-label";
    labelElement.textContent = label;

    const formatted = formatValue(value);
    const copyButton = createCopyButton(formatted);

    head.append(labelElement, copyButton);

    const valueElement = document.createElement("div");
    valueElement.className = "admin-detail-value";
    valueElement.textContent = formatted;

    field.append(head, valueElement);

    return field;
  }

  function addDetailField(container, label, value, options = {}) {
    const field = createField(label, value, options);

    if (field) {
      container.appendChild(field);
    }
  }

  function addDetailSection(container, title, fields, options = {}) {
    const entries = Object.entries(fields || {}).filter(
      ([, value]) => !isEmpty(value)
    );

    if (!entries.length) return;

    const section = document.createElement("section");
    section.className = "admin-detail-section";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const grid = document.createElement("div");
    grid.className = "admin-detail-grid";

    entries.forEach(([key, value]) => {
      addDetailField(grid, prettyKey(key), value, {
        fullWidth:
          options.fullWidthAll ||
          typeof value === "object" ||
          String(value).length > 180
      });
    });

    section.append(heading, grid);
    container.appendChild(section);
  }

  function addRawDetailSection(container, title, object, excludedKeys = []) {
    if (!object || typeof object !== "object") return;

    const excluded = new Set([
      "id",
      "client_id",
      "created_at",
      "updated_at",
      ...excludedKeys
    ]);

    const fields = {};

    Object.entries(object).forEach(([key, value]) => {
      if (excluded.has(key) || isEmpty(value)) return;

      // Hide internal metadata rather than displaying it as client information.
      if (
        key.startsWith("internal_") ||
        key === "password" ||
        key === "access_token" ||
        key === "refresh_token"
      ) {
        return;
      }

      fields[key] = value;
    });

    addDetailSection(container, title, fields);
  }

  function addImageSection(container, title, images) {
    if (!images || !images.length) return;

    const section = document.createElement("section");
    section.className = "admin-detail-section";

    const heading = document.createElement("h3");
    heading.textContent = `${title} (${images.length})`;

    const grid = document.createElement("div");
    grid.className = "admin-image-grid";

    images.forEach((image) => {
      if (!image?.url) return;

      const anchor = document.createElement("a");
      anchor.className = "admin-image-card";
      anchor.href = image.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.title = "Open full image in a new tab";

      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.name || title;
      img.loading = "lazy";
      img.decoding = "async";

      img.addEventListener("error", () => {
        img.alt = "Image could not be loaded";
        img.style.objectFit = "contain";
      });

      const caption = document.createElement("span");
      caption.className = "admin-image-caption";
      caption.textContent = image.name || "View image";

      anchor.append(img, caption);
      grid.appendChild(anchor);
    });

    if (!grid.children.length) return;

    section.append(heading, grid);
    container.appendChild(section);
  }

  function addEmptyMessage(container, message) {
    const empty = document.createElement("div");
    empty.className = "admin-empty";
    empty.textContent = message;
    container.appendChild(empty);
  }

  // -------------------------------------------------------
  // Supabase data loading
  // -------------------------------------------------------

  async function getTableRows(table, clientId) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("client_id", clientId);

    if (error) {
      // Some optional tables may not exist in every project setup.
      console.warn(`Could not load ${table}:`, error.message);
      return [];
    }

    return data || [];
  }

  async function getTableRowsByIds(table, ids) {
    if (!ids.length) return [];

    const { data, error } = await db
      .from(table)
      .select("*")
      .in("project_id", ids);

    if (error) {
      console.warn(`Could not load ${table}:`, error.message);
      return [];
    }

    return data || [];
  }

  async function loadClients() {
    setMessage(elements.dashboardMessage, "Loading clients…");

    const { data, error } = await db
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Unable to load clients:", error);
      setMessage(
        elements.dashboardMessage,
        `Unable to load clients: ${error.message}`,
        "error"
      );
      return;
    }

    state.clients = data || [];
    renderClientList();

    setMessage(
      elements.dashboardMessage,
      state.clients.length
        ? `${state.clients.length} client(s) loaded.`
        : "No clients found."
    );
  }

  async function loadClientDetails(client) {
    state.selectedClient = client;
    state.selectedRequirements = [];
    state.selectedProjects = [];
    state.selectedProjectImages = [];
    state.selectedTeamImages = [];
    state.selectedFiles = [];

    renderClientList();

    const container = elements.detailPanel;

    if (!container) return;

    container.innerHTML = "";
    addEmptyMessage(container, "Loading client details…");

    const clientId = client.id;

    const [
      requirements,
      projects,
      teamImages,
      files
    ] = await Promise.all([
      getTableRows("website_requirements", clientId),
      getTableRows("projects", clientId),
      getTableRows("team_images", clientId),
      getTableRows("client_files", clientId)
    ]);

    state.selectedRequirements = requirements;
    state.selectedProjects = projects;
    state.selectedTeamImages = teamImages;
    state.selectedFiles = files;

    const projectIds = projects
      .map((project) => project.id)
      .filter(Boolean);

    let projectImages = [];

    if (projectIds.length) {
      projectImages = await getTableRowsByIds("project_images", projectIds);
    }

    state.selectedProjectImages = projectImages;

    renderDetail(client);
  }

  // -------------------------------------------------------
  // Client list and filtering
  // -------------------------------------------------------

  function renderClientList() {
    const list = elements.enquiryList;

    if (!list) return;

    const search = String(elements.searchInput?.value || "")
      .trim()
      .toLowerCase();

    const type = String(elements.typeFilter?.value || "").toLowerCase();
    const status = String(elements.statusFilter?.value || "").toLowerCase();

    const filtered = state.clients.filter((client) => {
      const searchable = [
        getClientName(client),
        getClientEmail(client),
        client.phone,
        client.business_type,
        client.website_type,
        client.status
      ].filter(Boolean).join(" ").toLowerCase();

      if (search && !searchable.includes(search)) return false;

      if (status && status !== "all") {
        if (getClientStatus(client).toLowerCase() !== status) return false;
      }

      if (type && type !== "all") {
        const clientType = String(
          client.business_type ||
          client.website_type ||
          client.project_type ||
          ""
        ).toLowerCase();

        if (clientType !== type) return false;
      }

      return true;
    });

    list.innerHTML = "";

    if (!filtered.length) {
      addEmptyMessage(list, "No clients match your search or filters.");
      return;
    }

    filtered.forEach((client) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "admin-client-row";

      if (state.selectedClient?.id === client.id) {
        button.classList.add("active");
      }

      const name = document.createElement("strong");
      name.textContent = getClientName(client);

      const email = document.createElement("small");
      email.textContent = getClientEmail(client) || "No email provided";

      const statusPill = document.createElement("span");
      statusPill.className = "admin-status-pill";
      statusPill.textContent = statusLabel(getClientStatus(client));

      button.append(name, email, statusPill);

      button.addEventListener("click", () => {
        loadClientDetails(client).catch((error) => {
          console.error("Could not load client details:", error);
          setMessage(
            elements.dashboardMessage,
            "Could not load client details. Check the console and Supabase permissions.",
            "error"
          );
        });
      });

      list.appendChild(button);
    });
  }

  // -------------------------------------------------------
  // Detail rendering
  // -------------------------------------------------------

  function renderDetail(client) {
    const container = elements.detailPanel;

    if (!container) return;

    container.innerHTML = "";

    const header = document.createElement("section");
    header.className = "admin-detail-section";

    const title = document.createElement("h2");
    title.textContent = getClientName(client);

    const email = document.createElement("p");
    email.className = "admin-detail-value";
    email.textContent = getClientEmail(client) || "No email provided";

    header.append(title, email);
    container.appendChild(header);

    // Copy all details button.
    const copyRow = document.createElement("div");
    copyRow.className = "admin-copy-all-row";

    const copyAll = document.createElement("button");
    copyAll.type = "button";
    copyAll.className = "admin-copy-all-btn";
    copyAll.textContent = "Copy All Details";

    copyAll.addEventListener("click", async () => {
      const content = buildAllClientDetailsText(client);
      const success = await copyText(content);

      copyAll.textContent = success ? "Copied!" : "Copy failed";

      window.setTimeout(() => {
        copyAll.textContent = "Copy All Details";
      }, 1600);
    });

    copyRow.appendChild(copyAll);
    container.appendChild(copyRow);

    // Client information: include fields that actually have values.
    addRawDetailSection(container, "Client Information", client, [
      "logo_path",
      "internal_notes"
    ]);

    // Website requirements can have different column names depending
    // on the form used. Render every populated field dynamically.
    if (state.selectedRequirements.length) {
      state.selectedRequirements.forEach((requirement, index) => {
        const titleText = state.selectedRequirements.length > 1
          ? `Website Requirements ${index + 1}`
          : "Website Requirements";

        addRawDetailSection(container, titleText, requirement);
      });
    } else {
      addEmptyMessage(container, "No website requirements have been submitted.");
    }

    // A dedicated Design Preferences section makes those answers easy
    // to find, even if the database uses different field names.
    const preferenceKeywords = [
      "design",
      "style",
      "color",
      "colour",
      "font",
      "layout",
      "reference",
      "inspiration",
      "moodboard",
      "mood_board",
      "website_example",
      "example_website",
      "preferred",
      "visual",
      "theme",
      "branding",
      "brand",
      "aesthetic"
    ];

    const preferenceFields = {};

    state.selectedRequirements.forEach((requirement, index) => {
      Object.entries(requirement || {}).forEach(([key, value]) => {
        const normalized = key.toLowerCase();

        const isPreference = preferenceKeywords.some((keyword) =>
          normalized.includes(keyword)
        );

        if (
          isPreference &&
          !isEmpty(value) &&
          !["id", "client_id", "created_at", "updated_at"].includes(normalized)
        ) {
          const label = state.selectedRequirements.length > 1
            ? `Requirement ${index + 1} — ${prettyKey(key)}`
            : key;

          preferenceFields[label] = value;
        }
      });
    });

    if (Object.keys(preferenceFields).length) {
      addDetailSection(
        container,
        "Design Preferences",
        preferenceFields,
        { fullWidthAll: true }
      );
    } else {
      addDetailSection(
        container,
        "Design Preferences",
        {
          information:
            "No populated design preference fields were found. Check the Website Requirements section for all submitted answers."
        },
        { fullWidthAll: true }
      );
    }

    // Projects.
    if (state.selectedProjects.length) {
      state.selectedProjects.forEach((project, index) => {
        addRawDetailSection(
          container,
          state.selectedProjects.length > 1
            ? `Project ${index + 1}`
            : "Project Details",
          project,
          ["client_id"]
        );
      });
    } else {
      addEmptyMessage(container, "No projects have been added for this client.");
    }

    // Logo preview, if the client has a stored logo.
    if (client.logo_path) {
      renderStoredImages(
        container,
        "Company Logo",
        [{ storage_path: client.logo_path, original_filename: "Company logo" }]
      ).catch((error) => {
        console.warn("Could not display company logo:", error);
      });
    }

    // Team image gallery.
    renderStoredImages(
      container,
      "Team Images",
      state.selectedTeamImages
    ).catch((error) => {
      console.warn("Could not display team images:", error);
    });

    // Project image gallery.
    renderStoredImages(
      container,
      "Project Images",
      state.selectedProjectImages
    ).catch((error) => {
      console.warn("Could not display project images:", error);
    });

    // Client-uploaded files and images.
    renderStoredImages(
      container,
      "Client Uploads",
      state.selectedFiles
    ).catch((error) => {
      console.warn("Could not display client files:", error);
    });

    // Status and notes controls.
    renderStatusControls(container, client);
    renderNotesControls(container, client);

    // Per-field copy buttons use event delegation.
    container.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy-text]");

      if (!button || !container.contains(button)) return;

      const success = await copyText(button.dataset.copyText || "");
      const originalLabel = button.textContent;

      button.textContent = success ? "Copied!" : "Failed";

      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1300);
    });
  }

  function buildAllClientDetailsText(client) {
    const lines = [];

    function appendObject(title, object, excludedKeys = []) {
      if (!object || typeof object !== "object") return;

      const excluded = new Set([
        "id",
        "client_id",
        "created_at",
        "updated_at",
        "password",
        "access_token",
        "refresh_token",
        ...excludedKeys
      ]);

      const entries = Object.entries(object).filter(([key, value]) => {
        return !excluded.has(key) && !isEmpty(value);
      });

      if (!entries.length) return;

      lines.push("", `=== ${title} ===`);

      entries.forEach(([key, value]) => {
        lines.push(`${prettyKey(key)}:`);
        lines.push(formatValue(value));
      });
    }

    lines.push(`Client: ${getClientName(client)}`);

    appendObject("Client Information", client, ["logo_path"]);

    state.selectedRequirements.forEach((requirement, index) => {
      appendObject(
        state.selectedRequirements.length > 1
          ? `Website Requirements ${index + 1}`
          : "Website Requirements",
        requirement
      );
    });

    state.selectedProjects.forEach((project, index) => {
      appendObject(
        state.selectedProjects.length > 1
          ? `Project ${index + 1}`
          : "Project Details",
        project
      );
    });

    if (state.selectedTeamImages.length) {
      lines.push("", "=== Team Images ===");
      state.selectedTeamImages.forEach((image) => {
        lines.push(
          image.original_filename ||
          image.filename ||
          image.name ||
          image.storage_path ||
          "Team image"
        );
      });
    }

    if (state.selectedProjectImages.length) {
      lines.push("", "=== Project Images ===");
      state.selectedProjectImages.forEach((image) => {
        lines.push(
          image.original_filename ||
          image.filename ||
          image.name ||
          image.storage_path ||
          "Project image"
        );
      });
    }

    if (state.selectedFiles.length) {
      lines.push("", "=== Client Uploads ===");
      state.selectedFiles.forEach((file) => {
        lines.push(
          file.original_filename ||
          file.filename ||
          file.name ||
          file.storage_path ||
          "Uploaded file"
        );
      });
    }

    return lines.join("\n").trim();
  }

  // -------------------------------------------------------
  // Image URL handling
  // -------------------------------------------------------

  function extractStoragePath(row) {
    return (
      row.storage_path ||
      row.file_path ||
      row.image_path ||
      row.logo_path ||
      row.path ||
      ""
    );
  }

  function extractStorageBucket(row) {
    return (
      row.storage_bucket ||
      row.bucket_name ||
      row.bucket ||
      "client-uploads"
    );
  }

  async function resolveStorageUrl(row) {
    const path = extractStoragePath(row);

    if (!path) return "";

    // External URL: no signed URL required.
    if (/^https?:\/\//i.test(path)) return path;

    const bucket = extractStorageBucket(row);
    const cacheKey = `${bucket}:${path}`;

    if (state.signedUrlCache.has(cacheKey)) {
      return state.signedUrlCache.get(cacheKey);
    }

    const { data, error } = await db.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      console.warn("Could not create signed URL:", {
        bucket,
        path,
        error: error?.message
      });
      return "";
    }

    state.signedUrlCache.set(cacheKey, data.signedUrl);
    return data.signedUrl;
  }

  async function renderStoredImages(container, title, rows) {
    if (!container || !rows?.length) return;

    const imageRows = rows.filter((row) => {
      const path = extractStoragePath(row);

      return path && (
        looksLikeImage(path, row) ||
        row.image_type === "image" ||
        row.is_image === true ||
        title === "Company Logo"
      );
    });

    if (!imageRows.length) {
      if (title === "Client Uploads") {
        const files = rows.filter((row) => !looksLikeImage(extractStoragePath(row), row));

        if (files.length) {
          addRawDetailSection(
            container,
            "Other Uploaded Files",
            {
              files: files.map((file) => ({
                name:
                  file.original_filename ||
                  file.filename ||
                  file.name ||
                  "Uploaded file",
                path: extractStoragePath(file)
              }))
            }
          );
        }
      }

      return;
    }

    const images = await Promise.all(
      imageRows.map(async (row) => {
        const url = await resolveStorageUrl(row);

        return {
          url,
          name:
            row.original_filename ||
            row.filename ||
            row.file_name ||
            row.name ||
            title
        };
      })
    );

    const validImages = images.filter((image) => image.url);

    if (validImages.length) {
      addImageSection(container, title, validImages);
    }
  }

  // -------------------------------------------------------
  // Status update
  // -------------------------------------------------------

  function renderStatusControls(container, client) {
    const section = document.createElement("section");
    section.className = "admin-detail-section";

    const heading = document.createElement("h3");
    heading.textContent = "Update Status";

    const actions = document.createElement("div");
    actions.className = "admin-detail-actions";

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Client status");

    const currentStatus = getClientStatus(client);

    const options = [...new Set([...statusOptions, currentStatus])];

    options.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = statusLabel(status);
      option.selected = status === currentStatus;
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
        console.error("Status update failed:", error);
        message.textContent = `Could not update status: ${error.message}`;
      } finally {
        save.disabled = false;
      }
    });

    actions.append(select, save, message);
    section.append(heading, actions);
    container.appendChild(section);
  }

  // -------------------------------------------------------
  // Internal notes
  // -------------------------------------------------------

  function renderNotesControls(container, client) {
    const section = document.createElement("section");
    section.className = "admin-detail-section admin-note-area";

    const heading = document.createElement("h3");
    heading.textContent = "Internal Notes";

    const description = document.createElement("p");
    description.textContent =
      "Notes for your own team. These are not intended as public website content.";

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Write internal notes here…";
    textarea.value = client.internal_notes || "";
    textarea.setAttribute("aria-label", "Internal notes");

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
        console.error("Could not save notes:", error);
        message.textContent =
          `Could not save notes: ${error.message}. Check whether the internal_notes column exists.`;
      } finally {
        save.disabled = false;
      }
    });

    section.append(heading, description, textarea, save, message);
    container.appendChild(section);
  }

  // -------------------------------------------------------
  // Authentication and dashboard
  // -------------------------------------------------------

  function showLoggedInUI(isLoggedIn) {
    if (elements.loginCard) {
      elements.loginCard.hidden = isLoggedIn;
    }

    if (elements.dashboard) {
      elements.dashboard.hidden = !isLoggedIn;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const form = elements.loginForm;
    if (!form) return;

    const emailInput = form.querySelector(
      'input[type="email"], input[name="email"]'
    );

    const passwordInput = form.querySelector(
      'input[type="password"], input[name="password"]'
    );

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      setMessage(elements.loginMessage, "Enter your email and password.", "error");
      return;
    }

    const submitButton = form.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitButton) submitButton.disabled = true;

    setMessage(elements.loginMessage, "Signing in…");

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      setMessage(elements.loginMessage, "");
    } catch (error) {
      console.error("Login failed:", error);
      setMessage(
        elements.loginMessage,
        error.message || "Login failed. Please check your credentials.",
        "error"
      );
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function handleLogout() {
    if (elements.logoutBtn) elements.logoutBtn.disabled = true;

    try {
      const { error } = await db.auth.signOut();

      if (error) throw error;

      state.clients = [];
      state.selectedClient = null;

      if (elements.enquiryList) elements.enquiryList.innerHTML = "";
      if (elements.detailPanel) elements.detailPanel.innerHTML = "";

      showLoggedInUI(false);
    } catch (error) {
      console.error("Logout failed:", error);
      setMessage(elements.dashboardMessage, error.message, "error");
    } finally {
      if (elements.logoutBtn) elements.logoutBtn.disabled = false;
    }
  }

  async function initialise() {
    injectStyles();

    if (elements.loginForm) {
      elements.loginForm.addEventListener("submit", handleLogin);
    }

    if (elements.logoutBtn) {
      elements.logoutBtn.addEventListener("click", handleLogout);
    }

    if (elements.refreshBtn) {
      elements.refreshBtn.addEventListener("click", () => {
        loadClients().catch((error) => {
          console.error("Refresh failed:", error);
        });
      });
    }

    elements.searchInput?.addEventListener("input", renderClientList);
    elements.typeFilter?.addEventListener("change", renderClientList);
    elements.statusFilter?.addEventListener("change", renderClientList);

    const {
      data: { session },
      error
    } = await db.auth.getSession();

    if (error) {
      console.error("Could not check session:", error);
      setMessage(elements.loginMessage, error.message, "error");
      showLoggedInUI(false);
      return;
    }

    showLoggedInUI(Boolean(session));

    if (session) {
      await loadClients();
    }

    db.auth.onAuthStateChange((_event, nextSession) => {
      showLoggedInUI(Boolean(nextSession));

      if (nextSession) {
        loadClients().catch((loadError) => {
          console.error("Client loading failed:", loadError);
        });
      } else {
        state.clients = [];
        state.selectedClient = null;

        if (elements.enquiryList) elements.enquiryList.innerHTML = "";
        if (elements.detailPanel) elements.detailPanel.innerHTML = "";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initialise().catch((error) => {
      console.error("Admin dashboard initialisation failed:", error);
      setMessage(
        elements.dashboardMessage,
        "Dashboard could not start. Check your Supabase configuration and browser console.",
        "error"
      );
    });
  });
})();
 
