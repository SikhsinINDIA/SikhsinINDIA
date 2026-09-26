/* Adds a show/hide (eye) button to every <input type="password"> on the page,
   including inputs added later by scripts. Include with:
   <script src="/pw-toggle.js" defer></script> */
(function () {
  "use strict";
  var LABELS = {
    en: ["Show password", "Hide password"],
    hi: ["पासवर्ड दिखाएँ", "पासवर्ड छिपाएँ"],
    pa: ["ਪਾਸਵਰਡ ਵੇਖੋ", "ਪਾਸਵਰਡ ਲੁਕਾਓ"]
  };
  var lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  var labels = LABELS[lang] || LABELS.en;

  var EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var style = document.createElement("style");
  style.textContent =
    ".pw-toggle-wrap{position:relative;}" +
    ".pw-toggle-btn{position:absolute;top:50%;right:8px;transform:translateY(-50%);width:32px;height:32px;padding:0;margin:0;" +
    "display:flex;align-items:center;justify-content:center;background:transparent !important;border:0 !important;border-radius:6px;" +
    "cursor:pointer;opacity:.75;line-height:0;box-shadow:none !important;min-width:0;}" +
    ".pw-toggle-btn:hover,.pw-toggle-btn:focus-visible{opacity:1;outline:2px solid currentColor;outline-offset:-2px;}";
  (document.head || document.documentElement).appendChild(style);

  function enhance(input) {
    if (input.getAttribute("data-pw-toggle")) return;
    input.setAttribute("data-pw-toggle", "1");
    var parent = input.parentNode;
    if (!parent) return;

    // Full-width inputs get a block wrapper; fixed-width ones a shrink-wrapped inline-block.
    var cs = getComputedStyle(input);
    var pcs = getComputedStyle(parent);
    var pw = parent.clientWidth - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0);
    // offsetWidth ignores CSS transforms (e.g. entrance animations that scale the card)
    var fullWidth = pw > 0 && input.offsetWidth >= pw * 0.9;
    var wrap = document.createElement("span");
    wrap.className = "pw-toggle-wrap";
    wrap.style.display = fullWidth ? "block" : (cs.display === "block" ? "block" : "inline-block");
    if (!fullWidth && cs.display === "block") wrap.style.width = cs.width;
    if (cs.flexGrow !== "0") wrap.style.flex = cs.flex;
    var w0 = input.offsetWidth;
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    // Safety net: if wrapping shrank the input (percentage width inside a shrink-wrapped box), use a block wrapper.
    if (wrap.style.display !== "block" && input.offsetWidth < w0 - 4) wrap.style.display = "block";

    if (fullWidth || cs.boxSizing === "border-box") input.style.boxSizing = "border-box";
    var pr = parseFloat(cs.paddingRight) || 0;
    if (pr < 44) input.style.paddingRight = "44px";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle-btn";
    btn.style.color = cs.color;
    btn.setAttribute("aria-label", labels[0]);
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = EYE;
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.setAttribute("aria-label", show ? labels[1] : labels[0]);
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      input.focus();
    });
    // Never leave the password visible after the form is submitted / page hidden.
    var form = input.form;
    if (form) form.addEventListener("submit", function () {
      if (input.type !== "password") { input.type = "password"; btn.innerHTML = EYE; btn.setAttribute("aria-pressed", "false"); btn.setAttribute("aria-label", labels[0]); }
    });
    wrap.appendChild(btn);
  }

  function scan(root) {
    var list = (root || document).querySelectorAll('input[type="password"]:not([data-pw-toggle])');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  scan();
  if (window.MutationObserver) {
    new MutationObserver(function () { scan(); }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
