(() => {
  "use strict";
  const form = document.querySelector("#requirementsForm");
  const panels = [...document.querySelectorAll(".form-step")];
  const navItems = [...document.querySelectorAll(".nav-step")];
  const progressFill = document.querySelector("#progressFill");
  const progressTitle = document.querySelector("#progressTitle");
  const progressPercent = document.querySelector("#progressPercent");
  const topStep = document.querySelector("#topStep");
  const prevBtn = document.querySelector("#prevBtn");
  const nextBtn = document.querySelector("#nextBtn");
  const submitBtn = document.querySelector("#submitBtn");
  const projectTemplate = document.querySelector("#projectTemplate");
  const projectsContainer = document.querySelector("#projectsContainer");
  const stepTitles = ["CLIENT & COMPANY DETAILS","ABOUT YOUR COMPANY","RECENT PROJECTS","WEBSITE REQUIREMENTS","DESIGN PREFERENCES","BUDGET & TIMELINE","REVIEW & SUBMIT"];
  let currentStep = 0;
  let projectCount = 0;
  const maxFileSize = 8 * 1024 * 1024;
  const allowedImages = ["image/jpeg","image/png","image/webp"];
  const allowedLogoTypes = ["image/png","image/jpeg","image/webp","image/svg+xml"];

  document.querySelector("#year").textContent = new Date().getFullYear();

  function updateStep(index) {
    currentStep = Math.max(0, Math.min(index, panels.length - 1));
    panels.forEach((panel, i) => panel.classList.toggle("active", i === currentStep));
    navItems.forEach((item, i) => {
      item.classList.toggle("active", i === currentStep);
      item.classList.toggle("complete", i < currentStep);
      if (i === currentStep) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    const percent = Math.round(((currentStep + 1) / panels.length) * 100);
    progressFill.style.width = percent + "%";
    progressTitle.textContent = String(currentStep + 1).padStart(2, "0") + " / " + stepTitles[currentStep];
    progressPercent.textContent = percent + "% complete";
    topStep.textContent = "Step " + (currentStep + 1) + " of " + panels.length;
    prevBtn.disabled = currentStep === 0;
    nextBtn.hidden = currentStep === panels.length - 1;
    submitBtn.hidden = currentStep !== panels.length - 1;
    if (currentStep === panels.length - 1) buildReview();
    document.querySelector(".form-panel").scrollIntoView({behavior:"smooth", block:"start"});
  }

  function setError(control, message) {
    control.setAttribute("aria-invalid", "true");
    const parent = control.closest("label, fieldset, .consent");
    const error = parent?.querySelector(".error");
    if (error) { error.textContent = message; error.classList.add("visible"); }
  }
  function clearError(control) {
    control.removeAttribute("aria-invalid");
    const parent = control.closest("label, fieldset, .consent");
    const error = parent?.querySelector(".error");
    if (error) { error.textContent = ""; error.classList.remove("visible"); }
  }
  function validatePanel(index) {
    let valid = true;
    const panel = panels[index];
    panel.querySelectorAll("[required]").forEach(control => {
      clearError(control);
      if (control.type === "radio") return;
      if (control.type === "checkbox" && !control.checked) {
        valid = false; setError(control, "Please confirm before submitting."); return;
      }
      if (!String(control.value || "").trim()) {
        valid = false; setError(control, "This field is required.");
      } else if (control.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(control.value.trim())) {
        valid = false; setError(control, "Enter a valid email address.");
      } else if (control.type === "url" && control.value.trim()) {
        try { new URL(control.value.trim()); } catch { valid = false; setError(control, "Enter a valid URL including https://."); }
      }
    });
    panel.querySelectorAll('input[type="radio"][required]').forEach(radio => {
      const group = panel.querySelectorAll('input[type="radio"][name="' + CSS.escape(radio.name) + '"]');
      if (![...group].some(el => el.checked)) {
        valid = false;
        const error = radio.closest("fieldset")?.querySelector(".error");
        if (error) { error.textContent = "Please choose an option."; error.classList.add("visible"); }
      } else {
        const error = radio.closest("fieldset")?.querySelector(".error");
        if (error) { error.textContent = ""; error.classList.remove("visible"); }
      }
    });
    if (index === 2) {
      projectsContainer.querySelectorAll(".project-card").forEach(card => {
        card.querySelectorAll("[required]").forEach(control => {
          clearError(control);
          if (!control.value.trim()) { valid = false; setError(control, "Please complete this project field or remove this project."); }
        });
      });
    }
    if (!valid) {
      const first = panel.querySelector('[aria-invalid="true"]') || panel.querySelector(".error.visible");
      first?.scrollIntoView({behavior:"smooth",block:"center"});
      if (first?.focus) first.focus({preventScroll:true});
    }
    return valid;
  }

  nextBtn.addEventListener("click", () => {
    if (!validatePanel(currentStep)) return;
    updateStep(currentStep + 1);
  });
  prevBtn.addEventListener("click", () => updateStep(currentStep - 1));
  navItems.forEach(item => item.addEventListener("click", () => {
    const target = Number(item.dataset.step);
    if (target <= currentStep) updateStep(target);
    else {
      let firstInvalid = -1;
      for (let i = currentStep; i < target; i++) if (!validatePanel(i)) { firstInvalid = i; break; }
      if (firstInvalid === -1) updateStep(target);
      else updateStep(firstInvalid);
    }
  }));
  form.addEventListener("input", event => {
    if (event.target.matches("[required]")) clearError(event.target);
  });
  form.addEventListener("change", event => {
    if (event.target.matches("[required]")) clearError(event.target);
  });

  function bytesLabel(bytes) {
    return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + " KB" : (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
  function makeFileChip(file, onRemove, previewImage = true) {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    if (previewImage && file.type.startsWith("image/") && file.type !== "image/svg+xml") {
      const img = document.createElement("img");
      img.alt = ""; img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      chip.append(img);
    }
    const info = document.createElement("span");
    info.textContent = file.name;
    const size = document.createElement("small"); size.textContent = bytesLabel(file.size);
    info.append(size); chip.append(info);
    const remove = document.createElement("button");
    remove.type = "button"; remove.setAttribute("aria-label", "Remove " + file.name); remove.textContent = "×";
    remove.addEventListener("click", onRemove);
    chip.append(remove);
    return chip;
  }
  function renderInputFiles(input, target, opts = {}) {
    target.replaceChildren();
    const files = [...input.files];
    const validFiles = [];
    files.forEach(file => {
      const typeAllowed = (opts.logo ? allowedLogoTypes : allowedImages).includes(file.type) ||
        (opts.logo && /\.svg$/i.test(file.name));
      if (!typeAllowed) { showUploadError(target, file.name + ": unsupported file type."); return; }
      if (file.size > (opts.logo ? 5 : 8) * 1024 * 1024) { showUploadError(target, file.name + ": file is too large."); return; }
      validFiles.push(file);
    });
    // Keep only validated selections in the input; no files are uploaded by this frontend.
    if (validFiles.length !== files.length) {
      const transfer = new DataTransfer();
      validFiles.forEach(f => transfer.items.add(f));
      input.files = transfer.files;
    }
    validFiles.forEach(file => target.append(makeFileChip(file, () => {
      const transfer = new DataTransfer();
      [...input.files].filter(f => f !== file).forEach(f => transfer.items.add(f));
      input.files = transfer.files;
      renderInputFiles(input, target, opts);
    }, true)));
  }
  function showUploadError(target, message) {
    let warning = target.parentElement.querySelector(".upload-error");
    if (!warning) { warning = document.createElement("small"); warning.className = "upload-error error visible"; target.after(warning); }
    warning.textContent = message;
  }
  document.querySelector("#logoUpload").addEventListener("change", e => renderInputFiles(e.target, document.querySelector("#logoPreview"), {logo:true}));
  document.querySelector("#teamUpload").addEventListener("change", e => renderInputFiles(e.target, document.querySelector("#teamPreview")));

  function addProject() {
    projectCount++;
    const fragment = projectTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".project-card");
    card.querySelector(".project-index").textContent = "PROJECT " + String(projectCount).padStart(2,"0");
    card.querySelector("h3").textContent = "Project details";
    card.querySelector(".remove-project").addEventListener("click", () => {
      card.remove(); renumberProjects();
    });
    const mainInput = card.querySelector('[data-key="images"]');
    mainInput.addEventListener("change", () => renderInputFiles(mainInput, card.querySelector("[data-preview]")));
    const beforeInput = card.querySelector('[data-key="before_images"]');
    beforeInput.addEventListener("change", () => renderInputFiles(beforeInput, card.querySelector("[data-preview-before]")));
    const afterInput = card.querySelector('[data-key="after_images"]');
    afterInput.addEventListener("change", () => renderInputFiles(afterInput, card.querySelector("[data-preview-after]")));
    projectsContainer.append(card);
    renumberProjects();
    card.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function renumberProjects() {
    [...projectsContainer.querySelectorAll(".project-card")].forEach((card,i) => {
      card.querySelector(".project-index").textContent = "PROJECT " + String(i+1).padStart(2,"0");
    });
  }
  document.querySelector("#addProject").addEventListener("click", addProject);
  addProject();

  document.querySelectorAll('input[name="features"]').forEach(input => input.addEventListener("change", updateConditionalQuestions));
  function updateConditionalQuestions() {
    const selected = [...document.querySelectorAll('input[name="features"]:checked')].map(i => i.value);
    document.querySelector("#ecommerceQuestions").hidden = !(selected.includes("E-commerce") || selected.includes("Online payments"));
    document.querySelector("#bookingQuestions").hidden = !selected.includes("Booking system");
  }
  document.querySelector("#currencySelect").addEventListener("change", e => {
    document.querySelector("#otherCurrencyField").hidden = e.target.value !== "Other";
  });

  function readFormValue(name) {
    const controls = [...form.querySelectorAll('[name="' + CSS.escape(name) + '"]')];
    if (!controls.length) return "";
    if (controls[0].type === "checkbox") return controls.filter(c => c.checked).map(c => c.value);
    if (controls[0].type === "radio") return controls.find(c => c.checked)?.value || "";
    return controls[0].value.trim();
  }
  function safeText(value) {
    if (Array.isArray(value)) return value.length ? value.join(", ") : "";
    return value || "";
  }
  function buildReview() {
    const host = document.querySelector("#reviewContent");
    host.replaceChildren();
    const groups = [
      {title:"Client & company",step:0,fields:[["Company","company_name"],["Business type","business_type"],["Contact","contact_name"],["Email","email"],["Phone","phone"],["WhatsApp","whatsapp"],["Country","country"],["Location","city"],["Address","address"],["Website","website_url"],["Instagram","instagram_url"],["Facebook","facebook_url"],["LinkedIn","linkedin_url"]]},
      {title:"About your company",step:1,fields:[["About","about_description"],["Founded","founding_year"],["Experience","experience"],["What makes you different","differentiators"],["Certifications","certifications"],["Achievements","achievements"],["Service areas","service_areas"]]},
      {title:"Recent projects",step:2,custom:"projects"},
      {title:"Website requirements",step:3,fields:[["Project type","website_type"],["Pages","pages"],["Home sections","home_sections"],["About sections","about_sections"],["Portfolio sections","portfolio_sections"],["Features","features"],["E-commerce products","product_count"],["Booking type","booking_type"]]},
      {title:"Design preferences",step:4,fields:[["Brand colours","brand_colours"],["Style","website_style"],["Reference URLs","reference_urls"],["Domain","domain_name"],["Hosting","hosting_status"],["Content readiness","content_status"]]},
      {title:"Budget & timeline",step:5,fields:[["Budget","budget_amount"],["Currency","currency"],["Other currency","other_currency"],["Budget notes","budget_notes"]]}
    ];
    groups.forEach(group => {
      const box = document.createElement("section"); box.className = "review-group";
      const head = document.createElement("div"); head.className = "review-group-head";
      const title = document.createElement("h3"); title.textContent = group.title;
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit section ↗";
      edit.addEventListener("click", () => updateStep(group.step));
      head.append(title,edit); box.append(head);
      const grid = document.createElement("div"); grid.className = "review-grid";
      if (group.custom === "projects") {
        const cards = [...projectsContainer.querySelectorAll(".project-card")];
        if (!cards.length) { const empty = document.createElement("span"); empty.className="review-empty"; empty.textContent="No projects added."; grid.append(empty); }
        cards.forEach((card,i) => {
          const name = card.querySelector('[data-key="project_name"]').value.trim() || "Untitled project";
          const desc = card.querySelector('[data-key="description"]').value.trim();
          addReviewItem(grid,"Project " + (i+1),name + (desc ? " — " + desc : ""));
        });
      } else group.fields.forEach(([label,name]) => {
        const value = safeText(readFormValue(name));
        if (value) addReviewItem(grid,label,value);
      });
      if (!grid.children.length) { const empty=document.createElement("span");empty.className="review-empty";empty.textContent="No details added yet.";grid.append(empty); }
      box.append(grid); host.append(box);
    });
  }
  function addReviewItem(grid,label,value) {
    const item=document.createElement("div");item.className="review-item";
    const small=document.createElement("small");small.textContent=label;
    const strong=document.createElement("strong");strong.textContent=value;
    item.append(small,strong);grid.append(item);
  }

  function collectProjectData() {
    return [...projectsContainer.querySelectorAll(".project-card")].map(card => {
      const item = {};
      card.querySelectorAll("[data-key]").forEach(control => {
        const key = control.dataset.key;
        if (control.type !== "file") item[key] = control.value.trim();
      });
      return item;
    });
  }
  function collectPayload() {
    const data = {};
    const fd = new FormData(form);
    for (const [key, value] of fd.entries()) {
      if (value instanceof File) continue;
      if (key === "pages" || key === "home_sections" || key === "about_sections" ||
          key === "portfolio_sections" || key === "features") {
        if (!data[key]) data[key] = [];
        data[key].push(value);
      } else data[key] = value;
    }
    data.projects = collectProjectData();
    return data;
  }
  function appendSelectedFiles(fd) {
    const logo = document.querySelector("#logoUpload").files[0];
    if (logo) fd.append("logo", logo, logo.name);
    [...document.querySelector("#teamUpload").files].forEach(file => fd.append("team_images", file, file.name));
    [...projectsContainer.querySelectorAll(".project-card")].forEach((card, i) => {
      [["images","project_" + i + "_images"],["before_images","project_" + i + "_before"],["after_images","project_" + i + "_after"]].forEach(([key, field]) => {
        [...card.querySelector('[data-key="' + key + '"]').files].forEach(file => fd.append(field, file, file.name));
      });
    });
  }
  submitBtn.addEventListener("click", async () => {
    if (!validatePanel(6)) return;
    const msg = document.querySelector("#submitMessage");
    msg.hidden = false;
    msg.className = "submit-message info";
    msg.textContent = "Submitting your requirements securely…";
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Submitting…";
    try {
      const fd = new FormData();
      fd.append("payload", JSON.stringify(collectPayload()));
      appendSelectedFiles(fd);
      const response = await fetch("/api/submit", { method: "POST", body: fd });
      let result = {};
      try { result = await response.json(); } catch {}
      if (!response.ok) throw new Error(result.error || "Submission failed. Please try again.");
      msg.className = "submit-message info";
      msg.textContent = "Thank you! Your website requirements have been submitted successfully. Reference: " + (result.reference || "received");
      form.reset();
      projectsContainer.replaceChildren();
      projectCount = 0;
      addProject();
      document.querySelector("#logoPreview").replaceChildren();
      document.querySelector("#teamPreview").replaceChildren();
    } catch (error) {
      msg.className = "submit-message error-state";
      msg.textContent = error.message || "We couldn't submit your requirements. Please try again.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit requirements <span>↗</span>';
    }
    msg.scrollIntoView({behavior:"smooth",block:"center"});
  });
  updateStep(0);
})();