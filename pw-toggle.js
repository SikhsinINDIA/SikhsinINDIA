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
    ".pw-toggle-btn{position:absolute;top:0;right:8px;width:32px;height:32px;padding:0;margin:0;" +
    "display:flex;align-items:center;justify-content:center;background:transparent !important;border:0 !important;border-radius:6px;" +
    "cursor:pointer;opacity:.75;line-height:0;box-shadow:none !important;min-width:0;}" +
    ".pw-toggle-btn:hover,.pw-toggle-btn:focus-visible{opacity:1;outline:2px solid currentColor;outline-offset:-2px;}";
  (document.head || document.documentElement).appendChild(style);

  function enhance(input) {
    if (input.getAttribute("data-pw-toggle")) return;
    input.setAttribute("data-pw-toggle", "1");
    var parent = input.parentNode;
    if (!parent) return;

    // Always a block wrapper: it never shrinks the input (percentage widths keep working);
    // the eye button is positioned against the input's own box in place().
    var cs = getComputedStyle(input);
    var wrap = document.createElement("span");
    wrap.className = "pw-toggle-wrap";
    wrap.style.display = "block";
    if (cs.flexGrow !== "0" || cs.flexShrink !== "1") wrap.style.flex = cs.flex;
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    if (cs.boxSizing === "border-box") {
      var pr = parseFloat(cs.paddingRight) || 0;
      if (pr < 44) input.style.paddingRight = "44px";
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle-btn";
    btn.style.color = cs.color;
    btn.setAttribute("aria-label", labels[0]);
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = EYE;
    // Many pages style the field with input[type="password"] selectors, which stop matching once the
    // type becomes "text". Freeze the computed look as inline styles while the password is visible.
    var FREEZE = ["boxSizing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "marginTop", "marginRight", "marginBottom", "marginLeft", "borderRadius", "backgroundColor", "color",
      "fontSize", "fontFamily", "fontWeight", "letterSpacing", "lineHeight", "boxShadow"];
    ["Top", "Right", "Bottom", "Left"].forEach(function (side) {
      FREEZE.push("border" + side + "Width", "border" + side + "Style", "border" + side + "Color");
    });
    var savedStyle = null;
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      if (show) {
        var live = getComputedStyle(input);
        savedStyle = input.getAttribute("style");
        var frozen = {};
        FREEZE.forEach(function (p) { frozen[p] = live[p]; });
        // Keep the width proportional to its container (not a snapshot in px) so it stays responsive.
        if (wrap.clientWidth > 0) frozen.width = (input.offsetWidth / wrap.clientWidth * 100).toFixed(2) + "%";
        input.type = "text";
        for (var p in frozen) input.style[p] = frozen[p];
      } else {
        input.type = "password";
        if (savedStyle === null) input.removeAttribute("style"); else input.setAttribute("style", savedStyle);
      }
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.setAttribute("aria-label", show ? labels[1] : labels[0]);
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      input.focus();
    });
    // Never leave the password visible after the form is submitted / page hidden.
    var form = input.form;
    if (form) form.addEventListener("submit", function () {
      if (input.type !== "password") { input.type = "password"; if (savedStyle === null) input.removeAttribute("style"); else input.setAttribute("style", savedStyle); btn.innerHTML = EYE; btn.setAttribute("aria-pressed", "false"); btn.setAttribute("aria-label", labels[0]); }
    });
    wrap.appendChild(btn);

    function place() {
      var h = input.offsetHeight;
      if (!h) return; // hidden (e.g. inside a collapsed form) - retried when it becomes visible
      btn.style.top = (input.offsetTop + (h - 32) / 2) + "px";
      btn.style.right = (wrap.clientWidth - input.offsetLeft - input.offsetWidth + 6) + "px";
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("load", place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    if (window.ResizeObserver) { var ro = new ResizeObserver(place); ro.observe(input); ro.observe(wrap); }
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
