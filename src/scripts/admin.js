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
  let supabase = null, allClients = [], requirements = [], projects = [], projectImages = [], teamImages = [], clientFiles = [], selectedId = null;

  function setMessage(el, message, error=false) { el.textContent = message; el.classList.toggle("error", error); }
  function node(tag, cls, text) { const el=document.createElement(tag); if(cls)el.className=cls; if(text!==undefined)el.textContent=text; return el; }
  function value(obj, key) { const v=obj?.[key]; if(v===null||v===undefined||v==="")return "—"; if(Array.isArray(v))return v.join(", ")||"—"; if(typeof v==="object")return JSON.stringify(v,null,2); return String(v); }
  function statusFor(clientId) { return requirements.find(r=>r.client_id===clientId) || {}; }
  function budgetLabel(req) { return req.custom_budget == null ? "Budget not set" : `${req.currency || ""} ${Number(req.custom_budget).toLocaleString()}`; }
  function escapeText(str) { return String(str ?? ""); }

  async function init() {
    if (!window.supabase || !cfg.url || cfg.url.includes("YOUR_PROJECT_ID") || !cfg.anonKey || cfg.anonKey.includes("YOUR_SUPABASE")) {
      setMessage(loginMessage, "Set your Supabase URL and publishable/anon key in src/scripts/config.js first.", true);
      return;
    }
    supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
    const {data:{session}} = await supabase.auth.getSession();
    if (session) await showDashboard();
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) showDashboard(); else showLogin();
    });
  }
  function showLogin() { loginCard.hidden=false; dashboard.hidden=true; logoutBtn.hidden=true; }
  async function showDashboard() {
    loginCard.hidden=true; dashboard.hidden=false; logoutBtn.hidden=false;
    await loadData();
  }
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!supabase) return;
    const data = new FormData(loginForm);
    setMessage(loginMessage,"Signing in…");
    const {error}=await supabase.auth.signInWithPassword({email:data.get("email"),password:data.get("password")});
    if(error) setMessage(loginMessage,error.message,true);
    else { loginForm.reset(); setMessage(loginMessage,""); await showDashboard(); }
  });
  logoutBtn.addEventListener("click", async()=>{ if(supabase) await supabase.auth.signOut(); showLogin(); });
  document.querySelector("#refreshBtn").addEventListener("click",loadData);
  document.querySelector("#searchInput").addEventListener("input",renderList);
  document.querySelector("#typeFilter").addEventListener("change",renderList);
  document.querySelector("#statusFilter").addEventListener("change",renderList);

  async function loadData() {
    if(!supabase)return;
    list.replaceChildren(node("div","empty","Loading enquiries…"));
    setMessage(dashboardMessage,"");
    const [clientsRes, reqRes, projRes, projectImgRes, teamImgRes, clientFileRes] = await Promise.all([
      supabase.from("clients").select("*").order("created_at",{ascending:false}),
      supabase.from("website_requirements").select("*").order("created_at",{ascending:false}),
      supabase.from("projects").select("*").order("created_at",{ascending:false}),
      supabase.from("project_images").select("*").order("created_at",{ascending:false}),
      supabase.from("team_images").select("*").order("created_at",{ascending:false}),
      supabase.from("client_files").select("*").order("created_at",{ascending:false})
    ]);
    const error = clientsRes.error || reqRes.error || projRes.error || projectImgRes.error || teamImgRes.error || clientFileRes.error;
    if(error) {
      setMessage(dashboardMessage,"Could not load enquiries. Check admin_users membership and Supabase RLS policies: "+error.message,true);
      list.replaceChildren(node("div","empty","No data available."));
      return;
    }
    allClients=clientsRes.data||[];requirements=reqRes.data||[];projects=projRes.data||[];
    projectImages=projectImgRes.data||[];teamImages=teamImgRes.data||[];clientFiles=clientFileRes.data||[];
    const typeFilter=document.querySelector("#typeFilter");
    const current=typeFilter.value;
    typeFilter.replaceChildren(new Option("All business types",""));
    [...new Set(allClients.map(c=>c.business_type).filter(Boolean))].sort().forEach(t=>typeFilter.add(new Option(t,t)));
    typeFilter.value=current;
    renderList();
    if(selectedId && allClients.some(c=>c.id===selectedId)) renderDetail(selectedId);
    else if(allClients.length) renderDetail(allClients[0].id);
    else detail.replaceChildren(node("div","empty","No enquiries have been submitted yet."));
    setMessage(dashboardMessage,`${allClients.length} client enquiry${allClients.length===1?"":"ies"} loaded.`);
  }
  function renderList() {
    const search=document.querySelector("#searchInput").value.toLowerCase().trim();
    const type=document.querySelector("#typeFilter").value;
    const status=document.querySelector("#statusFilter").value;
    const filtered=allClients.filter(c=>{
      const req=statusFor(c.id);
      return (!search || `${c.company_name} ${c.email} ${c.contact_name}`.toLowerCase().includes(search)) &&
        (!type || c.business_type===type) && (!status || (req.status||"New")===status);
    });
    list.replaceChildren();
    if(!filtered.length){list.append(node("div","empty","No enquiries match these filters."));return;}
    filtered.forEach(c=>{
      const req=statusFor(c.id), btn=node("button","enquiry-item"+(selectedId===c.id?" selected":""));
      btn.type="button";
      btn.append(node("strong","",c.company_name||"Untitled company"),node("small","",`${c.contact_name||"No contact"} · ${c.email||"No email"}`));
      const meta=node("div","enquiry-meta");
      meta.append(node("span","status-pill",req.status||"New"),node("span","budget",budgetLabel(req)));
      btn.append(meta);btn.addEventListener("click",()=>{selectedId=c.id;renderList();renderDetail(c.id);});
      list.append(btn);
    });
  }
  function addDetailField(grid,label,val,wide=false) {
    const item=node("div","detail-field"+(wide?" wide":""));
    item.append(node("small","",label),node("strong","",value({v:val},"v")));
    grid.append(item);
  }
  function addSection(parent,title,content) {
    const section=node("section","detail-section");section.append(node("h3","",title));
    if(typeof content==="string")section.append(node("p","",content||"—"));else section.append(content);
    parent.append(section);
  }
  function renderDetail(id) {
    selectedId=id;
    const c=allClients.find(x=>x.id===id); if(!c)return;
    const req=statusFor(id);
    detail.replaceChildren();
    const top=node("div","detail-top"), title=node("div");
    title.append(node("h2","",c.company_name||"Untitled company"),node("p","",`${c.contact_name||""} · ${c.email||""}`));
    top.append(title,node("span","status-pill",req.status||"New"));detail.append(top);
    const grid=node("div","detail-fields");
    [["Business type",c.business_type],["Email",c.email],["Phone",c.phone],["WhatsApp",c.whatsapp],["Country",c.country],["City",c.city],["Address",c.address],["Website",c.website_url],["Instagram",c.social_links?.instagram],["Facebook",c.social_links?.facebook],["LinkedIn",c.social_links?.linkedin],["Founded",c.founding_year],["Experience",c.experience],["Service areas",c.service_areas],["Certifications",c.certifications],["Achievements",c.achievements]].forEach(([k,v])=>addDetailField(grid,k,v));
    detail.append(grid);
    addSection(detail,"About the company",c.about_description);
    addSection(detail,"What makes the company different",c.differentiators);
    const projectRows=projects.filter(p=>p.client_id===id);
    const projectBox=node("div");
    if(!projectRows.length)projectBox.append(node("p","","No projects provided."));
    projectRows.forEach(p=>{
      const block=node("div");block.style.marginBottom="16px";
      block.append(node("strong","",p.project_name||"Project"),node("p","",p.description||""));
      const extra=node("p","",`Type: ${p.project_type||"—"} · Location: ${p.location||"—"} · Completed: ${p.completion_date||"—"}\nOutcome: ${p.outcome||"—"}`);
      block.append(extra);projectBox.append(block);
    });
    addSection(detail,"Recent projects",projectBox);
   
    // Show company logo, team images and project images separately
    const fileBox = node("div");
    const relatedProjectIds = projectRows.map(p => p.id);

    const logoFiles = clientFiles.filter(
      f => f.client_id === id &&
           (f.image_type === "logo" || f.storage_path?.includes("/logo/"))
    );

    const teamFiles = teamImages.filter(f => f.client_id === id);

    const projectFileGroups = projectRows.map((project, index) => ({
      project,
      title: `Project ${index + 1}: ${project.project_name || "Untitled project"}`,
      files: projectImages.filter(
        f => f.client_id === id && f.project_id === project.id
      )
    }));

    async function renderImageGroup(parent, title, files) {
      const group = node("div");
      group.style.marginBottom = "20px";
      group.append(node("h4", "", title));

      if (!files.length) {
        group.append(node("p", "", "No images uploaded."));
        parent.append(group);
        return;
      }

      const imageGrid = node("div", "admin-image-grid");
      imageGrid.style.display = "grid";
      imageGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(130px, 1fr))";
      imageGrid.style.gap = "12px";

      for (const file of files) {
        const card = node("div", "admin-image-card");
        const img = document.createElement("img");
        img.alt = file.original_filename || title;
        img.loading = "lazy";
        img.style.width = "100%";
        img.style.height = "120px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "10px";

        const caption = node(
          "small",
          "",
          `${file.image_type || "image"} · ${file.original_filename || ""}`
        );

        card.append(img, caption);
        imageGrid.append(card);

        const { data, error } = await supabase.storage
          .from("client-uploads")
          .createSignedUrl(file.storage_path, 60);

        if (!error && data?.signedUrl) {
          img.src = data.signedUrl;
          img.style.cursor = "pointer";
          img.addEventListener("click", () => {
            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
          });
        } else {
          img.alt = "Image preview unavailable";
          caption.textContent = `${file.original_filename || "Image"} — preview unavailable`;
        }
      }

      group.append(imageGrid);
      parent.append(group);
    }

    await renderImageGroup(fileBox, "Company Logo", logoFiles);
    await renderImageGroup(fileBox, "Team / Workplace Images", teamFiles);

    for (const group of projectFileGroups) {
      await renderImageGroup(fileBox, group.title, group.files);
    }

    addSection(detail, "Client Images & Project Gallery", fileBox);

    const reqBox=node("div");
    [["Project type",req.website_type],["Pages",req.selected_pages],["Home sections",req.home_sections],["About sections",req.about_sections],["Portfolio sections",req.portfolio_sections],["Features",req.selected_features],["Budget",budgetLabel(req)],["Reference URLs",req.reference_urls],["Design preferences",req.design_preferences],["Additional notes",req.additional_notes]].forEach(([k,v])=>{
      const row=node("div");row.style.marginBottom="12px";row.append(node("small","",k),node("p","",value({v},"v")));reqBox.append(row);
    });
    addSection(detail,"Website requirements",reqBox);

    const editSection=node("section","detail-section");editSection.append(node("h3","","Manage enquiry"));
    const statusLabel=node("label","","Status");
    const statusSelect=document.createElement("select");
    ["New","Reviewing","Contacted","Quoted","In Progress","Completed","Rejected"].forEach(s=>statusSelect.add(new Option(s,s)));
    statusSelect.value=req.status||"New";statusLabel.append(statusSelect);editSection.append(statusLabel);
    const notesLabel=node("label","","Internal notes");
    const notes=document.createElement("textarea");notes.placeholder="Private notes for your team…";notes.value=req.internal_notes||"";notesLabel.append(notes);editSection.append(notesLabel);
    const save=node("button","btn primary","Save status and notes");save.type="button";
    save.addEventListener("click",async()=>{
      save.disabled=true;save.textContent="Saving…";
      const {error}=await supabase.from("website_requirements").update({status:statusSelect.value,internal_notes:notes.value}).eq("client_id",id);
      save.disabled=false;save.textContent="Save status and notes";
      if(error)setMessage(dashboardMessage,"Could not update enquiry: "+error.message,true);
      else {setMessage(dashboardMessage,"Status and notes updated.");const r=requirements.find(x=>x.client_id===id);if(r){r.status=statusSelect.value;r.internal_notes=notes.value;}renderList();}
    });
    editSection.append(save);detail.append(editSection);
  }
  init();
})();
