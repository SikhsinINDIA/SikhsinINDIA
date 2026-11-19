/*
 * Builds the "Gurudwaras near me" page in English, Hindi and Punjabi:
 *   04-gurudwaras/04-gurudwaras-near-me.html  (and hi/, pa/ copies)
 * Safe to re-run; edit the text here, not in the pages.
 *
 *   node scripts/build-gurudwaras-near-me.js
 *
 * The page reads data/gurudwaras.json (built by scripts/gurudwaras-data.js)
 * in the visitor's browser, finds where they are (their phone's location, or
 * a city / PIN code they type, looked up with OpenStreetMap's Nominatim) and
 * lists the nearest Gurudwaras with distance, address, phone, a link to the
 * Gurudwara's own page and Google Maps directions.
 * Run `node scripts/seo-optimize.js` afterwards (JSON-LD, hreflang, sitemap).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://sikhsinindia.com";
const REL = "04-gurudwaras/04-gurudwaras-near-me.html";

const T = {
  en: {
    locale: "en_IN", switchLabel: "EN",
    title: "Gurudwara Near Me: Find the Nearest Gurudwara | SikhsInIndia.com",
    description: "Find a Gurudwara near you. Share your location or type your city or PIN code to see the nearest Gurudwaras with distance, address, phone and Google Maps directions.",
    keywords: "gurudwara near me, gurdwara near me, nearest gurudwara, gurudwara nearby, gurudwara near my location, Sikh temple near me, gurudwara directions",
    eyebrow: "Sikh Heritage &amp; Holy Places",
    h1: "GURUDWARAS <span>NEAR ME</span>",
    subtitle: "Find the nearest Gurudwara, wherever you are",
    tagline: "Faith &nbsp;·&nbsp; Seva &nbsp;·&nbsp; Sangat &nbsp;·&nbsp; Heritage",
    intro: "Every Gurudwara is open to all, with Gurbani, Langar and a place to rest. Share your location, or type your city or PIN code, to find the Gurudwaras closest to you.",
    findHeading: "Find a <span>Gurudwara</span>",
    findSub: "Your location stays on your phone",
    useLocation: "Use my location",
    or: "or",
    placeholder: "City, area or PIN code",
    search: "Search",
    popular: "Popular cities:",
    cities: ["Delhi", "Amritsar", "Mumbai", "Chandigarh", "Ludhiana", "Patna", "Nanded", "Kolkata", "Bengaluru"],
    resultsHeading: "Nearest <span>Gurudwaras</span>",
    loading: "Loading Gurudwaras…",
    locating: "Finding your location…",
    searching: "Searching for “{q}”…",
    near: "Gurudwaras nearest to {place}",
    yourLocation: "your location",
    denied: "Location permission was not given. Type your city or PIN code instead.",
    noGeo: "Your browser can't share its location. Type your city or PIN code instead.",
    notFound: "We couldn't find “{q}”. Try a city name or a 6-digit PIN code.",
    loadError: "The Gurudwara list could not be loaded. Please check your connection and try again.",
    away: "away",
    approx: "Approximate location",
    phone: "Phone",
    address: "Address",
    visit: "Visit Page",
    directions: "Directions",
    showMore: "Show more",
    far: "The nearest Gurudwara on our site is {d} away. Our directory covers India; for Gurudwaras near you, search Google Maps.",
    farLink: "Gurudwaras near you on Google Maps",
    howHeading: "How it <span>works</span>",
    how: [
      "<b>Use my location</b> asks your browser for your position once. It is used only on your phone to measure distances and is never sent to us.",
      "Or type a city, area or 6-digit PIN code, for example “Faridabad”, “Andheri, Mumbai” or “143001”.",
      "Tap a Gurudwara's name to read its history and see photos, <b>Directions</b> to open the route in Google Maps, or the phone number to call.",
      "The list covers the {n} Gurudwaras across India on SikhsInIndia.com. A Gurudwara near you missing? Write to us at sikhsinindia@gmail.com."
    ],
    browse: "Browse all Gurudwaras in India",
    credit: "Map positions and place search © <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a> contributors.",
    quote: "Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh &mdash; the Khalsa belongs to the Almighty, and victory too is His.",
    quoteAttr: "&mdash; Sikh Salutation",
    share: "Share This Page",
    back: "Back",
    footerRight: "Waheguru Ji Ka Khalsa · Waheguru Ji Ki Fateh",
    km: "km", m: "m"
  },
  hi: {
    locale: "hi_IN", switchLabel: "हिन्दी",
    title: "मेरे पास गुरुद्वारा: नज़दीकी गुरुद्वारा खोजें | SikhsInIndia.com",
    description: "अपने पास का गुरुद्वारा खोजें। अपना स्थान साझा करें या शहर / पिन कोड लिखें और नज़दीकी गुरुद्वारों की दूरी, पता, फ़ोन और गूगल मैप्स रास्ता देखें।",
    keywords: "मेरे पास गुरुद्वारा, नज़दीकी गुरुद्वारा, गुरुद्वारा नियर मी, gurudwara near me, पास का गुरुद्वारा",
    eyebrow: "सिख विरासत एवं पवित्र स्थल",
    h1: "मेरे पास <span>गुरुद्वारे</span>",
    subtitle: "आप जहाँ भी हों, नज़दीकी गुरुद्वारा खोजें",
    tagline: "आस्था &nbsp;·&nbsp; सेवा &nbsp;·&nbsp; संगत &nbsp;·&nbsp; विरासत",
    intro: "हर गुरुद्वारा सबके लिए खुला है — गुरबाणी, लंगर और विश्राम का स्थान। अपना स्थान साझा करें, या अपना शहर या पिन कोड लिखें, और अपने सबसे पास के गुरुद्वारे देखें।",
    findHeading: "<span>गुरुद्वारा</span> खोजें",
    findSub: "आपका स्थान आपके फ़ोन पर ही रहता है",
    useLocation: "मेरा स्थान इस्तेमाल करें",
    or: "या",
    placeholder: "शहर, इलाका या पिन कोड",
    search: "खोजें",
    popular: "प्रमुख शहर:",
    cities: ["दिल्ली", "अमृतसर", "मुंबई", "चंडीगढ़", "लुधियाना", "पटना", "नांदेड़", "कोलकाता", "बेंगलुरु"],
    resultsHeading: "नज़दीकी <span>गुरुद्वारे</span>",
    loading: "गुरुद्वारों की सूची लोड हो रही है…",
    locating: "आपका स्थान खोजा जा रहा है…",
    searching: "“{q}” खोजा जा रहा है…",
    near: "{place} के सबसे पास के गुरुद्वारे",
    yourLocation: "आपके स्थान",
    denied: "स्थान की अनुमति नहीं मिली। कृपया अपना शहर या पिन कोड लिखें।",
    noGeo: "आपका ब्राउज़र स्थान साझा नहीं कर सकता। कृपया अपना शहर या पिन कोड लिखें।",
    notFound: "“{q}” नहीं मिला। शहर का नाम या 6 अंकों का पिन कोड लिखकर देखें।",
    loadError: "गुरुद्वारों की सूची लोड नहीं हो सकी। कृपया इंटरनेट जाँचकर फिर कोशिश करें।",
    away: "दूर",
    approx: "अनुमानित स्थान",
    phone: "फ़ोन",
    address: "पता",
    visit: "पेज देखें",
    directions: "रास्ता",
    showMore: "और देखें",
    far: "हमारी साइट पर सबसे पास का गुरुद्वारा {d} दूर है। हमारी सूची भारत के गुरुद्वारों की है; अपने पास के गुरुद्वारे गूगल मैप्स पर खोजें।",
    farLink: "गूगल मैप्स पर आपके पास के गुरुद्वारे",
    howHeading: "यह कैसे <span>काम करता है</span>",
    how: [
      "<b>मेरा स्थान इस्तेमाल करें</b> दबाने पर ब्राउज़र एक बार आपका स्थान पूछता है। यह सिर्फ़ आपके फ़ोन पर दूरी मापने के लिए इस्तेमाल होता है, हमें कभी नहीं भेजा जाता।",
      "या शहर, इलाका या 6 अंकों का पिन कोड लिखें, जैसे “Faridabad”, “Andheri, Mumbai” या “143001”।",
      "गुरुद्वारे के नाम पर दबाकर उसका इतिहास और तस्वीरें देखें, <b>रास्ता</b> दबाकर गूगल मैप्स में रास्ता खोलें, या फ़ोन नंबर पर दबाकर कॉल करें।",
      "इस सूची में SikhsInIndia.com पर दिए भारत भर के {n} गुरुद्वारे हैं। आपके पास का कोई गुरुद्वारा छूट गया हो तो हमें sikhsinindia@gmail.com पर लिखें।"
    ],
    browse: "भारत के सभी गुरुद्वारे देखें",
    credit: "नक्शे की जगहें और स्थान खोज © <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a> योगदानकर्ता।",
    quote: "वाहेगुरु जी का खालसा, वाहेगुरु जी की फतह &mdash; खालसा ईश्वर का है, और विजय भी उसी की है।",
    quoteAttr: "&mdash; सिख अभिवादन",
    share: "इस पृष्ठ को साझा करें",
    back: "वापस",
    footerRight: "वाहेगुरु जी का खालसा · वाहेगुरु जी की फतह",
    km: "कि.मी.", m: "मी."
  },
  pa: {
    locale: "pa_IN", switchLabel: "ਪੰਜਾਬੀ",
    title: "ਮੇਰੇ ਨੇੜੇ ਗੁਰਦੁਆਰਾ: ਨਜ਼ਦੀਕੀ ਗੁਰਦੁਆਰਾ ਲੱਭੋ | SikhsInIndia.com",
    description: "ਆਪਣੇ ਨੇੜੇ ਦਾ ਗੁਰਦੁਆਰਾ ਲੱਭੋ। ਆਪਣੀ ਥਾਂ ਸਾਂਝੀ ਕਰੋ ਜਾਂ ਸ਼ਹਿਰ / ਪਿੰਨ ਕੋਡ ਲਿਖੋ ਅਤੇ ਨਜ਼ਦੀਕੀ ਗੁਰਦੁਆਰਿਆਂ ਦੀ ਦੂਰੀ, ਪਤਾ, ਫ਼ੋਨ ਅਤੇ ਗੂਗਲ ਮੈਪਸ ਰਸਤਾ ਵੇਖੋ।",
    keywords: "ਮੇਰੇ ਨੇੜੇ ਗੁਰਦੁਆਰਾ, ਨਜ਼ਦੀਕੀ ਗੁਰਦੁਆਰਾ, ਗੁਰਦੁਆਰਾ ਨੇੜੇ, gurudwara near me, gurdwara near me",
    eyebrow: "ਸਿੱਖ ਵਿਰਾਸਤ ਅਤੇ ਪਵਿੱਤਰ ਸਥਾਨ",
    h1: "ਮੇਰੇ ਨੇੜੇ <span>ਗੁਰਦੁਆਰੇ</span>",
    subtitle: "ਤੁਸੀਂ ਜਿੱਥੇ ਵੀ ਹੋਵੋ, ਨਜ਼ਦੀਕੀ ਗੁਰਦੁਆਰਾ ਲੱਭੋ",
    tagline: "ਆਸਥਾ &nbsp;·&nbsp; ਸੇਵਾ &nbsp;·&nbsp; ਸੰਗਤ &nbsp;·&nbsp; ਵਿਰਾਸਤ",
    intro: "ਹਰ ਗੁਰਦੁਆਰਾ ਸਭ ਲਈ ਖੁੱਲ੍ਹਾ ਹੈ — ਗੁਰਬਾਣੀ, ਲੰਗਰ ਅਤੇ ਆਰਾਮ ਦੀ ਥਾਂ। ਆਪਣੀ ਥਾਂ ਸਾਂਝੀ ਕਰੋ, ਜਾਂ ਆਪਣਾ ਸ਼ਹਿਰ ਜਾਂ ਪਿੰਨ ਕੋਡ ਲਿਖੋ, ਅਤੇ ਆਪਣੇ ਸਭ ਤੋਂ ਨੇੜੇ ਦੇ ਗੁਰਦੁਆਰੇ ਵੇਖੋ।",
    findHeading: "<span>ਗੁਰਦੁਆਰਾ</span> ਲੱਭੋ",
    findSub: "ਤੁਹਾਡੀ ਥਾਂ ਤੁਹਾਡੇ ਫ਼ੋਨ 'ਤੇ ਹੀ ਰਹਿੰਦੀ ਹੈ",
    useLocation: "ਮੇਰੀ ਥਾਂ ਵਰਤੋ",
    or: "ਜਾਂ",
    placeholder: "ਸ਼ਹਿਰ, ਇਲਾਕਾ ਜਾਂ ਪਿੰਨ ਕੋਡ",
    search: "ਲੱਭੋ",
    popular: "ਮੁੱਖ ਸ਼ਹਿਰ:",
    cities: ["ਦਿੱਲੀ", "ਅੰਮ੍ਰਿਤਸਰ", "ਮੁੰਬਈ", "ਚੰਡੀਗੜ੍ਹ", "ਲੁਧਿਆਣਾ", "ਪਟਨਾ", "ਨਾਂਦੇੜ", "ਕੋਲਕਾਤਾ", "ਬੰਗਲੌਰ"],
    resultsHeading: "ਨਜ਼ਦੀਕੀ <span>ਗੁਰਦੁਆਰੇ</span>",
    loading: "ਗੁਰਦੁਆਰਿਆਂ ਦੀ ਸੂਚੀ ਲੋਡ ਹੋ ਰਹੀ ਹੈ…",
    locating: "ਤੁਹਾਡੀ ਥਾਂ ਲੱਭੀ ਜਾ ਰਹੀ ਹੈ…",
    searching: "“{q}” ਲੱਭਿਆ ਜਾ ਰਿਹਾ ਹੈ…",
    near: "{place} ਦੇ ਸਭ ਤੋਂ ਨੇੜੇ ਦੇ ਗੁਰਦੁਆਰੇ",
    yourLocation: "ਤੁਹਾਡੀ ਥਾਂ",
    denied: "ਥਾਂ ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਮਿਲੀ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਸ਼ਹਿਰ ਜਾਂ ਪਿੰਨ ਕੋਡ ਲਿਖੋ।",
    noGeo: "ਤੁਹਾਡਾ ਬ੍ਰਾਊਜ਼ਰ ਥਾਂ ਸਾਂਝੀ ਨਹੀਂ ਕਰ ਸਕਦਾ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਸ਼ਹਿਰ ਜਾਂ ਪਿੰਨ ਕੋਡ ਲਿਖੋ।",
    notFound: "“{q}” ਨਹੀਂ ਲੱਭਿਆ। ਸ਼ਹਿਰ ਦਾ ਨਾਂ ਜਾਂ 6 ਅੰਕਾਂ ਦਾ ਪਿੰਨ ਕੋਡ ਲਿਖ ਕੇ ਵੇਖੋ।",
    loadError: "ਗੁਰਦੁਆਰਿਆਂ ਦੀ ਸੂਚੀ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕੀ। ਕਿਰਪਾ ਕਰਕੇ ਇੰਟਰਨੈੱਟ ਜਾਂਚ ਕੇ ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    away: "ਦੂਰ",
    approx: "ਅੰਦਾਜ਼ਨ ਥਾਂ",
    phone: "ਫ਼ੋਨ",
    address: "ਪਤਾ",
    visit: "ਪੰਨਾ ਵੇਖੋ",
    directions: "ਰਸਤਾ",
    showMore: "ਹੋਰ ਵੇਖੋ",
    far: "ਸਾਡੀ ਸਾਈਟ 'ਤੇ ਸਭ ਤੋਂ ਨੇੜੇ ਦਾ ਗੁਰਦੁਆਰਾ {d} ਦੂਰ ਹੈ। ਸਾਡੀ ਸੂਚੀ ਭਾਰਤ ਦੇ ਗੁਰਦੁਆਰਿਆਂ ਦੀ ਹੈ; ਆਪਣੇ ਨੇੜੇ ਦੇ ਗੁਰਦੁਆਰੇ ਗੂਗਲ ਮੈਪਸ 'ਤੇ ਲੱਭੋ।",
    farLink: "ਗੂਗਲ ਮੈਪਸ 'ਤੇ ਤੁਹਾਡੇ ਨੇੜੇ ਦੇ ਗੁਰਦੁਆਰੇ",
    howHeading: "ਇਹ ਕਿਵੇਂ <span>ਕੰਮ ਕਰਦਾ ਹੈ</span>",
    how: [
      "<b>ਮੇਰੀ ਥਾਂ ਵਰਤੋ</b> ਦਬਾਉਣ 'ਤੇ ਬ੍ਰਾਊਜ਼ਰ ਇੱਕ ਵਾਰ ਤੁਹਾਡੀ ਥਾਂ ਪੁੱਛਦਾ ਹੈ। ਇਹ ਸਿਰਫ਼ ਤੁਹਾਡੇ ਫ਼ੋਨ 'ਤੇ ਦੂਰੀ ਮਾਪਣ ਲਈ ਵਰਤੀ ਜਾਂਦੀ ਹੈ, ਸਾਨੂੰ ਕਦੇ ਨਹੀਂ ਭੇਜੀ ਜਾਂਦੀ।",
      "ਜਾਂ ਸ਼ਹਿਰ, ਇਲਾਕਾ ਜਾਂ 6 ਅੰਕਾਂ ਦਾ ਪਿੰਨ ਕੋਡ ਲਿਖੋ, ਜਿਵੇਂ “Faridabad”, “Andheri, Mumbai” ਜਾਂ “143001”।",
      "ਗੁਰਦੁਆਰੇ ਦੇ ਨਾਂ 'ਤੇ ਦਬਾ ਕੇ ਉਸ ਦਾ ਇਤਿਹਾਸ ਅਤੇ ਤਸਵੀਰਾਂ ਵੇਖੋ, <b>ਰਸਤਾ</b> ਦਬਾ ਕੇ ਗੂਗਲ ਮੈਪਸ ਵਿੱਚ ਰਸਤਾ ਖੋਲ੍ਹੋ, ਜਾਂ ਫ਼ੋਨ ਨੰਬਰ 'ਤੇ ਦਬਾ ਕੇ ਕਾਲ ਕਰੋ।",
      "ਇਸ ਸੂਚੀ ਵਿੱਚ SikhsInIndia.com 'ਤੇ ਦਿੱਤੇ ਭਾਰਤ ਭਰ ਦੇ {n} ਗੁਰਦੁਆਰੇ ਹਨ। ਤੁਹਾਡੇ ਨੇੜੇ ਦਾ ਕੋਈ ਗੁਰਦੁਆਰਾ ਰਹਿ ਗਿਆ ਹੋਵੇ ਤਾਂ ਸਾਨੂੰ sikhsinindia@gmail.com 'ਤੇ ਲਿਖੋ।"
    ],
    browse: "ਭਾਰਤ ਦੇ ਸਾਰੇ ਗੁਰਦੁਆਰੇ ਵੇਖੋ",
    credit: "ਨਕਸ਼ੇ ਦੀਆਂ ਥਾਵਾਂ ਅਤੇ ਥਾਂ ਖੋਜ © <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a> ਯੋਗਦਾਨੀ।",
    quote: "ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਹਿ &mdash; ਖਾਲਸਾ ਅਕਾਲ ਪੁਰਖ ਦਾ ਹੈ, ਅਤੇ ਜਿੱਤ ਵੀ ਉਸੇ ਦੀ ਹੈ।",
    quoteAttr: "&mdash; ਸਿੱਖ ਨਮਸਕਾਰ",
    share: "ਇਸ ਪੰਨੇ ਨੂੰ ਸਾਂਝਾ ਕਰੋ",
    back: "ਵਾਪਸ",
    footerRight: "ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ · ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਹਿ",
    km: "ਕਿ.ਮੀ.", m: "ਮੀ."
  }
};

// Quick-pick cities (same order as T.*.cities): centre points, no lookup needed.
const CITIES = [[28.6139, 77.209], [31.634, 74.8723], [19.076, 72.8777], [30.7333, 76.7794], [30.901, 75.8573], [25.5941, 85.1376], [19.1383, 77.321], [22.5726, 88.3639], [12.9716, 77.5946]];

const esc = (s) => String(s).replace(/&(?![a-z]+;|#\d+;)/g, "&amp;").replace(/"/g, "&quot;");

function page(lang) {
  const t = T[lang];
  const rel = lang === "en" ? REL : `${lang}/${REL}`;
  const url = `${SITE}/${rel}`;
  const up = lang === "en" ? "../" : "../../";
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "gurudwaras.json"), "utf8"));
  const switcher = ["en", "hi", "pa"].map((l) => l === lang
    ? `<span class="gsb-lang-current">${T[l].switchLabel}</span>`
    : `<a href="${SITE}/${l === "en" ? REL : `${l}/${REL}`}">${T[l].switchLabel}</a>`).join('<span class="gsb-lang-sep">|</span>');
  const strings = {
    loading: t.loading, locating: t.locating, searching: t.searching, near: t.near, yourLocation: t.yourLocation,
    denied: t.denied, noGeo: t.noGeo, notFound: t.notFound, loadError: t.loadError, away: t.away, approx: t.approx,
    phone: t.phone, visit: t.visit, directions: t.directions, showMore: t.showMore, far: t.far, farLink: t.farLink, km: t.km, m: t.m
  };
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-LHNTFNW14H"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-LHNTFNW14H');
  </script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${t.title}</title>

  <!-- SEO Meta -->
  <meta name="description" content="${esc(t.description)}">
  <meta name="keywords" content="${esc(t.keywords)}">
  <meta name="author" content="Sikhs in India">
  <meta name="robots" content="index, follow">

  <!-- Self-Referencing Canonical Tag -->
  <link rel="canonical" href="${url}">

  <!-- Open Graph Meta Tags -->
  <meta property="og:title" content="${esc(t.title)}">
  <meta property="og:description" content="${esc(t.description)}">
  <meta property="og:image" content="${SITE}/sikhsinindia.jpg">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="website">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(t.title)}">
  <meta name="twitter:description" content="${esc(t.description)}">
  <meta name="twitter:image" content="${SITE}/sikhsinindia.jpg">
  <meta property="og:site_name" content="Sikhs in India">
  <meta property="og:locale" content="${t.locale}">
  <meta property="og:image:alt" content="${esc(t.title.replace(/ \| SikhsInIndia\.com$/, ""))}">

  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:      #0d1b3e;
      --navy-mid:  #162147;
      --gold:      #F7941D;
      --gold-light:#F7941D;
      --cream:     #f5f0e8;
      --white:     #ffffff;
    }

    body {
      font-family: 'Lato', sans-serif;
      background: #1a1a2e;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      padding: 20px 8px;
    }

    .poster {
      width: 100%;
      max-width: 860px;
      background: var(--cream);
      position: relative;
      overflow: hidden;
      box-shadow: 0 20px 80px rgba(0,0,0,0.6);
    }

    /* ── HEADER ── */
    .header { background: var(--navy); display: flex; align-items: stretch; position: relative; }
    .header::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, transparent, var(--gold), var(--gold-light), var(--gold), transparent);
    }
    .logo-wrap { display: flex; align-items: center; padding: 16px 20px; flex-shrink: 0; }
    .logo-img { height: 90px; width: auto; background: #fff; padding: 4px; border-radius: 6px; }

    /* ── HERO ── */
    .hero {
      flex: 1;
      background: linear-gradient(160deg, var(--navy) 0%, #1a2a5e 55%, #0d1b3e 100%);
      padding: 32px 40px 28px; text-align: center; position: relative; overflow: hidden;
    }
    .hero::before { content: ''; position: absolute; top: -60px; right: -60px; width: 320px; height: 320px; border-radius: 50%; border: 1px solid rgba(184,145,58,0.15); }
    .hero::after { content: ''; position: absolute; top: -30px; right: -30px; width: 220px; height: 220px; border-radius: 50%; border: 1px solid rgba(184,145,58,0.1); }
    .hero-eyebrow { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: var(--gold); margin-bottom: 12px; font-weight: 700; }
    .hero-title {
      font-family: 'Playfair Display', serif; font-size: clamp(26px, 5.5vw, 46px); font-weight: 900;
      color: var(--white); line-height: 1.1; letter-spacing: -0.5px; margin-bottom: 6px;
    }
    .hero-title span { color: var(--gold-light); }
    .hero-subtitle { font-family: 'Playfair Display', serif; font-size: clamp(14px, 3vw, 22px); color: rgba(255,255,255,0.75); margin-bottom: 16px; font-style: italic; }
    .gold-rule { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 14px auto; }
    .gold-rule::before, .gold-rule::after { content: ''; flex: 1; max-width: 100px; height: 1px; background: linear-gradient(90deg, transparent, var(--gold)); }
    .gold-rule::after { background: linear-gradient(90deg, var(--gold), transparent); }
    .gold-rule-diamond { width: 7px; height: 7px; background: var(--gold); transform: rotate(45deg); }
    .hero-tagline { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: var(--gold); font-weight: 300; }

    /* ── INTRO BANNER ── */
    .intro-banner { background: linear-gradient(90deg, var(--gold) 0%, var(--gold-light) 50%, var(--gold) 100%); padding: 14px 40px; }
    .intro-banner p { font-family: 'Playfair Display', serif; font-size: 14px; color: var(--navy); font-weight: 700; line-height: 1.6; letter-spacing: 0.3px; text-align: center; }

    /* ── SECTION HEADINGS ── */
    .section-heading { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 900; color: var(--navy); text-align: center; margin-bottom: 4px; }
    .section-heading span { color: var(--gold); }
    .section-sub { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); font-weight: 700; text-align: center; margin-bottom: 20px; }

    /* ── FINDER ── */
    .finder-wrapper { background: var(--cream); padding: 28px 36px 8px; }
    .finder {
      background: var(--white); border: 1px solid rgba(184,145,58,0.35); border-left: 4px solid var(--gold);
      border-radius: 10px; padding: 20px; box-shadow: 0 2px 8px rgba(13,27,62,0.08); text-align: center;
    }
    .btn-locate { font-size: 13px; padding: 13px 26px; min-height: 48px; }
    .btn-locate svg { width: 16px; height: 16px; }
    .finder-or { margin: 14px 0 12px; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #888; font-weight: 700; }
    .search-row { display: flex; gap: 10px; max-width: 520px; margin: 0 auto; }
    .search-input {
      flex: 1; min-width: 0; font: 16px 'Lato', sans-serif; color: var(--navy);
      border: 1.5px solid rgba(184,145,58,0.6); border-radius: 6px; padding: 11px 14px; background: #fffdf9;
    }
    .search-input:focus { outline: 2px solid var(--gold); outline-offset: 1px; }
    .quick { margin-top: 14px; font-size: 12px; color: #555; line-height: 2.2; }
    .quick-city {
      font: 700 12px 'Lato', sans-serif; color: var(--navy); background: rgba(247,148,29,0.12);
      border: 1px solid rgba(247,148,29,0.5); border-radius: 999px; padding: 4px 11px; margin: 0 2px; cursor: pointer;
    }
    .quick-city:hover { background: rgba(247,148,29,0.25); }
    .status { margin-top: 16px; font-size: 13px; color: var(--navy); min-height: 1em; line-height: 1.6; }
    .status.error { color: #a32020; font-weight: 700; }

    /* ── RESULTS ── */
    .results-wrapper { background: var(--cream); padding: 20px 36px 28px; }
    .results-wrapper[hidden] { display: none; }
    .far-note {
      background: #fff6e8; border: 1px solid rgba(247,148,29,0.6); border-radius: 8px;
      padding: 12px 14px; font-size: 13px; color: var(--navy); line-height: 1.6; margin-bottom: 16px; text-align: center;
    }
    .far-note a { color: #b35f00; font-weight: 700; }
    .result-list { list-style: none; display: grid; gap: 14px; }
    .result {
      background: var(--white); border: 1px solid rgba(184,145,58,0.35); border-left: 4px solid var(--gold);
      border-radius: 8px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(13,27,62,0.08);
    }
    .result-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .result-name { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 700; color: var(--navy); line-height: 1.3; }
    .result-name a { color: inherit; text-decoration: none; }
    .result-name a:hover { text-decoration: underline; }
    .result-place { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gold); font-weight: 700; margin-top: 3px; }
    .result-dist { flex-shrink: 0; text-align: right; font-family: 'Playfair Display', serif; font-weight: 900; font-size: 18px; color: var(--navy); white-space: nowrap; }
    .result-dist small { display: block; font-family: 'Lato', sans-serif; font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: #888; font-weight: 700; }
    .result-addr { font-size: 12.5px; color: #333; line-height: 1.6; margin-top: 8px; }
    .result-phone { font-size: 12.5px; margin-top: 4px; }
    .result-phone a { color: var(--navy); font-weight: 700; }
    .approx { display: inline-block; font-size: 10px; font-weight: 700; color: #8a5a00; background: #fff3dc; border-radius: 4px; padding: 1px 6px; margin-top: 6px; }
    .result-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .btn-map { background: var(--navy); color: var(--white); box-shadow: inset 0 -2px 0 rgba(0,0,0,0.3), 0 0 0 2px var(--gold); }
    .more-row { text-align: center; margin-top: 18px; }

    /* ── HOW IT WORKS ── */
    .how-wrapper { background: var(--cream); padding: 8px 36px 26px; }
    .how-list { list-style: none; display: grid; gap: 10px; counter-reset: how; }
    .how-list li {
      counter-increment: how; position: relative; background: var(--white); border: 1px solid rgba(184,145,58,0.35);
      border-radius: 8px; padding: 12px 14px 12px 46px; font-size: 13px; color: #333; line-height: 1.65;
    }
    .how-list li::before {
      content: counter(how); position: absolute; left: 12px; top: 12px; width: 22px; height: 22px; border-radius: 50%;
      background: var(--gold); color: var(--navy); font-weight: 900; font-size: 12px; display: flex; align-items: center; justify-content: center;
    }
    .how-list b { color: var(--navy); }
    .browse-row { text-align: center; margin-top: 18px; }
    .credit { font-size: 11px; color: #666; text-align: center; margin-top: 16px; line-height: 1.6; }
    .credit a { color: #555; }

    /* ── QUOTE PANEL ── */
    .quote-panel { margin: 0 36px 28px; background: var(--navy); border-left: 4px solid var(--gold); padding: 20px 28px; position: relative; }
    .quote-mark { font-family: 'Playfair Display', serif; font-size: 60px; color: var(--gold); line-height: 0.6; position: absolute; top: 22px; left: 18px; opacity: 0.4; }
    .quote-text { font-family: 'Playfair Display', serif; font-size: 15px; color: var(--white); line-height: 1.6; font-style: italic; padding-left: 30px; margin-bottom: 8px; }
    .quote-attr { font-size: 10px; color: var(--gold); letter-spacing: 2px; text-transform: uppercase; padding-left: 30px; }

    /* ── FOOTER ── */
    .footer { background: var(--navy-mid); padding: 16px 36px; border-top: 2px solid var(--gold); }
    .footer-content { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .footer-left { font-size: 10px; color: rgba(255,255,255,0.45); letter-spacing: 2px; text-transform: uppercase; line-height: 1.7; }
    .footer-right { font-size: 10px; color: var(--gold); letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }

    /* Standard Button Template Layout — 3D gold style */
    .btn-back, .btn-detailed {
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      font-family: 'Lato', sans-serif; font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;
      text-decoration: none; color: var(--navy);
      background: linear-gradient(135deg, var(--gold-light) 0%, #e8830a 100%);
      border: none; border-radius: 5px; padding: 10px 20px; cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255,220,120,0.5), inset 0 -2px 0 rgba(0,0,0,0.2), 0 0 0 2px #9a5800, 0 0 0 3.5px var(--gold);
      transition: filter 0.15s, transform 0.1s; flex-shrink: 0;
    }
    .btn-back:hover, .btn-detailed:hover { filter: brightness(1.08); }
    .btn-back:active, .btn-detailed:active { transform: scale(0.97); filter: brightness(0.93); }
    .btn-back svg, .btn-detailed svg { width: 12px; height: 12px; }
    .btn-detailed.btn-map { color: var(--white); background: var(--navy); box-shadow: inset 0 -2px 0 rgba(0,0,0,0.3), 0 0 0 2px var(--gold); }
    .btn-detailed[disabled] { opacity: 0.6; cursor: wait; }
    /* Spaced-out letters break up Hindi and Punjabi script */
    html:not([lang="en"]) .btn-detailed, html:not([lang="en"]) .btn-back, html:not([lang="en"]) .section-sub,
    html:not([lang="en"]) .result-place, html:not([lang="en"]) .result-dist small, html:not([lang="en"]) .finder-or { letter-spacing: 0; }

    /* ── MOBILE — up to 480px ── */
    @media (max-width: 480px) {
      body { padding: 0; background: var(--navy); }
      .poster { box-shadow: none; }
      .header { flex-direction: column; align-items: stretch; }
      .logo-wrap { padding: 12px 16px 8px; justify-content: center; }
      .logo-img { height: 60px; }
      .hero { padding: 16px 14px 14px; }
      .hero-eyebrow { font-size: 9px; letter-spacing: 2px; margin-bottom: 8px; }
      .hero-title { font-size: 25px; letter-spacing: 0; margin-bottom: 4px; }
      .hero-subtitle { font-size: 14px; margin-bottom: 10px; }
      .hero-tagline { font-size: 9px; letter-spacing: 1.5px; }
      .gold-rule { margin: 10px auto; }
      .gold-rule::before, .gold-rule::after { max-width: 50px; }
      .intro-banner { padding: 10px 14px; }
      .intro-banner p { font-size: 12px; line-height: 1.55; }
      .section-heading { font-size: 18px; }
      .section-sub { font-size: 9px; letter-spacing: 1.5px; margin-bottom: 14px; }
      .finder-wrapper { padding: 18px 12px 6px; }
      .finder { padding: 16px 12px; }
      .btn-locate { width: 100%; }
      .search-row { flex-direction: column; }
      .search-row .btn-detailed { min-height: 44px; }
      .results-wrapper { padding: 14px 12px 20px; }
      .result { padding: 12px; }
      .result-name { font-size: 15.5px; }
      .result-dist { font-size: 16px; }
      .result-actions .btn-detailed { flex: 1; min-height: 44px; font-size: 10px; letter-spacing: 1px; padding: 9px 10px; }
      .how-wrapper { padding: 6px 12px 20px; }
      .quote-panel { margin: 0 12px 20px; padding: 16px 16px 16px 20px; }
      .quote-mark { font-size: 42px; top: 14px; left: 12px; }
      .quote-text { font-size: 13px; padding-left: 20px; }
      .quote-attr { font-size: 9px; padding-left: 20px; }
      .footer { padding: 14px 12px; }
      .footer-content { flex-direction: column; align-items: center; text-align: center; gap: 10px; }
      .btn-back { font-size: 10px; padding: 9px 22px; min-height: 44px; }
      .footer-left, .footer-right { font-size: 9px; letter-spacing: 1px; }
    }

    /* ── TABLET — 481px to 768px ── */
    @media (min-width: 481px) and (max-width: 768px) {
      body { padding: 10px 6px; }
      .logo-img { height: 72px; }
      .logo-wrap { padding: 12px 14px; }
      .hero { padding: 22px 24px 18px; }
      .intro-banner { padding: 10px 20px; }
      .finder-wrapper, .results-wrapper, .how-wrapper { padding-left: 20px; padding-right: 20px; }
      .quote-panel { margin: 0 20px 24px; }
      .footer { padding: 14px 20px; }
      .footer-content { flex-direction: column; align-items: center; text-align: center; gap: 10px; }
    }

    /* ── SOCIAL SHARE BAR ── */
    .gsb-share-container { text-align: center; margin: 24px 0 10px; padding: 16px; background: #fff; border-radius: 6px; border: 1px solid rgba(0,0,0,0.08); border-left: 5px solid #F7941D; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
    .gsb-share-title { font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 700; color: #0d1b3e; margin-bottom: 12px; }
    .gsb-share-buttons { display: flex; justify-content: center; align-items: center; gap: 12px; flex-wrap: wrap; }
    .gsb-share-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 4px; color: #fff; font-family: 'Lato', Arial, sans-serif; font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer; border: none; transition: transform 0.2s, filter 0.2s; }
    .gsb-share-btn:hover { transform: translateY(-2px); filter: brightness(1.1); color: #fff; }
    .gsb-btn-whatsapp { background-color: #25D366; }
    .gsb-btn-facebook { background-color: #1877F2; }
    .gsb-share-btn svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }

    /* ── LANGUAGE SWITCHER ── */
    .gsb-lang-switcher {
      position: fixed; top: 10px; right: 10px; z-index: 9999;
      background: rgba(13,27,62,0.92); border: 1px solid #F7941D; border-radius: 20px;
      padding: 6px 14px; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700;
      display: flex; gap: 8px; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .gsb-lang-switcher a { color: rgba(255,255,255,0.75); text-decoration: none; }
    .gsb-lang-switcher a:hover { color: #F7941D; }
    .gsb-lang-switcher .gsb-lang-current { color: #F7941D; }
    .gsb-lang-switcher .gsb-lang-sep { color: rgba(255,255,255,0.35); }
    @media (max-width:600px) { .gsb-lang-switcher { top: 4px; right: 4px; padding: 4px 8px; font-size: 10px; gap: 5px; } }
  </style>
</head>
<body>
<div class="gsb-lang-switcher">${switcher}</div>
<div class="poster">

  <!-- ── HEADER ── -->
  <div class="header">
    <div class="logo-wrap">
      <img class="logo-img" src="${up}pictures/00-index/sikhsinindia.png" alt="Sikhs In India Logo">
    </div>
    <div class="hero">
      <div class="hero-eyebrow">${t.eyebrow}</div>
      <h1 class="hero-title">${t.h1}</h1>
      <div class="hero-subtitle">${t.subtitle}</div>
      <div class="gold-rule"><div class="gold-rule-diamond"></div></div>
      <div class="hero-tagline">${t.tagline}</div>
    </div>
  </div>

  <!-- ── INTRO BANNER ── -->
  <div class="intro-banner">
    <p>${t.intro}</p>
  </div>

  <!-- ── FINDER ── -->
  <div class="finder-wrapper">
    <h2 class="section-heading">${t.findHeading}</h2>
    <div class="section-sub">${t.findSub}</div>
    <div class="finder">
      <button type="button" class="btn-detailed btn-locate" id="gnmLocate">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        ${t.useLocation}
      </button>
      <div class="finder-or">${t.or}</div>
      <form class="search-row" id="gnmForm" role="search">
        <input class="search-input" id="gnmQuery" type="search" name="q" placeholder="${esc(t.placeholder)}" aria-label="${esc(t.placeholder)}" autocomplete="off" enterkeyhint="search">
        <button type="submit" class="btn-detailed" id="gnmSearch">${t.search}</button>
      </form>
      <div class="quick">${t.popular}
        ${t.cities.map((c, i) => `<button type="button" class="quick-city" data-lat="${CITIES[i][0]}" data-lng="${CITIES[i][1]}">${c}</button>`).join("\n        ")}
      </div>
      <div class="status" id="gnmStatus" role="status" aria-live="polite"></div>
    </div>
  </div>

  <!-- ── RESULTS ── -->
  <div class="results-wrapper" id="gnmResults" hidden>
    <h2 class="section-heading">${t.resultsHeading}</h2>
    <div class="section-sub" id="gnmNear"></div>
    <div class="far-note" id="gnmFar" hidden></div>
    <ol class="result-list" id="gnmList"></ol>
    <div class="more-row"><button type="button" class="btn-detailed" id="gnmMore" hidden>${t.showMore}</button></div>
  </div>

  <!-- ── HOW IT WORKS ── -->
  <div class="how-wrapper">
    <h2 class="section-heading">${t.howHeading}</h2>
    <div class="section-sub">&nbsp;</div>
    <ol class="how-list">
      ${t.how.map((s) => `<li>${s.replace("{n}", data.count)}</li>`).join("\n      ")}
    </ol>
    <div class="browse-row"><a class="btn-detailed" href="04-gurudwaras-in-india.html">${t.browse}</a></div>
    <p class="credit">${t.credit}</p>
  </div>

  <!-- ── QUOTE ── -->
  <div class="quote-panel">
    <div class="quote-mark">"</div>
    <div class="quote-text">${t.quote}</div>
    <div class="quote-attr">${t.quoteAttr}</div>
  </div>

    <!-- ── SOCIAL SHARE BAR ── -->
    <div class="gsb-share-container">
      <div class="gsb-share-title">${t.share}</div>
      <div class="gsb-share-buttons">
        <button id="gsbWhatsappShare" class="gsb-share-btn gsb-btn-whatsapp" type="button">
          <svg viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
          WhatsApp
        </button>
        <button id="gsbFacebookShare" class="gsb-share-btn gsb-btn-facebook" type="button">
          <svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Facebook
        </button>
      </div>
    </div>
<div class="footer">
    <div class="footer-content">
      <button type="button" class="btn-back" onclick="goBack()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
        </svg>
        ${t.back}
      </button>
      <div class="footer-left">© Sikhs in India · sikhsinindia.com</div>
      <div class="footer-right">${t.footerRight}</div>
    </div>
  </div>

</div><!-- /poster -->

<script>
  function goBack() {
    window.location.href = "04-gurudwaras-in-india.html";
  }

  // Gurudwaras near me: everything runs in the visitor's browser; their
  // position is never sent anywhere (a typed place is looked up on OpenStreetMap).
  (function () {
    var LANG = "${lang}";
    var T = ${JSON.stringify(strings)};
    var PAGE = 10, FAR_KM = 150;
    var all = null, sorted = [], shown = 0;
    var $ = function (id) { return document.getElementById(id); };

    function setStatus(msg, isError) {
      var s = $("gnmStatus");
      s.textContent = msg || "";
      s.className = "status" + (isError ? " error" : "");
    }
    function fill(s, map) { return s.replace(/\\{(\\w+)\\}/g, function (m, k) { return map[k] != null ? map[k] : m; }); }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

    function load() {
      if (all) return Promise.resolve(all);
      return fetch("/data/gurudwaras.json").then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(function (d) { all = d.gurudwaras; return all; });
    }

    function km(aLat, aLng, bLat, bLng) {
      var r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
      var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 12742 * Math.asin(Math.sqrt(x));
    }
    function fmtDist(d) {
      if (d < 0.975) return Math.max(50, Math.round(d * 20) * 50) + " " + T.m;
      return (d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString("en-IN")) + " " + T.km;
    }

    function card(g) {
      var name = (g.name && g.name[LANG]) || g.name.en;
      var url = (g.url && g.url[LANG]) || g.url.en;
      var city = (g.city && g.city[LANG]) || g.city.en || "";
      var addr = (g.addressLocal && g.addressLocal[LANG]) || g.address;
      // An exact point routes straight to the Gurudwara; otherwise let Google find it by name and address.
      var dest = g.precision === "exact" ? g.lat + "," + g.lng : g.name.en + ", " + g.address;
      var maps = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest);
      var tel = g.phone ? g.phone.split(/\\s*[,\\/;]\\s*/)[0] : "";
      return '<li class="result">' +
        '<div class="result-top"><div>' +
          '<div class="result-name"><a href="' + esc(url) + '">' + esc(name) + '</a></div>' +
          (city ? '<div class="result-place">' + esc(city) + '</div>' : '') +
        '</div><div class="result-dist">' + fmtDist(g.d) + '<small>' + esc(T.away) + '</small></div></div>' +
        '<div class="result-addr">' + esc(addr) + '</div>' +
        (tel ? '<div class="result-phone">' + esc(T.phone) + ': <a href="tel:' + esc(tel.replace(/[^+\\d]/g, "")) + '">' + esc(g.phone) + '</a></div>' : '') +
        (g.precision !== "exact" ? '<span class="approx">' + esc(T.approx) + '</span>' : '') +
        '<div class="result-actions">' +
          '<a class="btn-detailed" href="' + esc(url) + '">' + esc(T.visit) + '</a>' +
          '<a class="btn-detailed btn-map" href="' + esc(maps) + '" target="_blank" rel="noopener">' + esc(T.directions) + '</a>' +
        '</div></li>';
    }

    function showMore() {
      var next = sorted.slice(shown, shown + PAGE);
      $("gnmList").insertAdjacentHTML("beforeend", next.map(card).join(""));
      shown += next.length;
      $("gnmMore").hidden = shown >= sorted.length || shown >= 50;
    }

    function showNear(lat, lng, placeLabel) {
      return load().then(function (list) {
        sorted = list.map(function (g) { return Object.assign({ d: km(lat, lng, g.lat, g.lng) }, g); })
          .sort(function (a, b) { return a.d - b.d; });
        shown = 0;
        $("gnmList").innerHTML = "";
        $("gnmNear").textContent = fill(T.near, { place: placeLabel });
        var far = $("gnmFar");
        if (sorted[0].d > FAR_KM) {
          far.innerHTML = esc(fill(T.far, { d: fmtDist(sorted[0].d) })) +
            '<br><a href="https://www.google.com/maps/search/gurudwara/@' + lat.toFixed(4) + ',' + lng.toFixed(4) + ',11z" target="_blank" rel="noopener">' + esc(T.farLink) + ' &rarr;</a>';
          far.hidden = false;
        } else far.hidden = true;
        showMore();
        setStatus("");
        $("gnmResults").hidden = false;
        $("gnmResults").scrollIntoView({ behavior: "smooth", block: "start" });
        if (typeof gtag === "function") gtag("event", "gurudwara_near_me", { method: placeLabel === T.yourLocation ? "location" : "search" });
      }).catch(function () { setStatus(T.loadError, true); });
    }

    $("gnmLocate").addEventListener("click", function () {
      if (!navigator.geolocation) { setStatus(T.noGeo, true); return; }
      setStatus(T.locating);
      load().catch(function () {});
      navigator.geolocation.getCurrentPosition(function (pos) {
        showNear(pos.coords.latitude, pos.coords.longitude, T.yourLocation);
      }, function () { setStatus(T.denied, true); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    });

    // A typed place: OpenStreetMap's Nominatim; a 6-digit number is an Indian PIN code.
    function lookup(q) {
      var base = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=" + LANG + "&";
      var pin = /^\\d{3}\\s?\\d{3}$/.test(q) ? q.replace(/\\s/g, "") : "";
      var url = base + (pin ? "postalcode=" + pin + "&countrycodes=in" : "q=" + encodeURIComponent(q));
      return fetch(url).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.length) return res[0];
        if (pin) return fetch(base + "q=" + pin + "%2C%20India").then(function (r) { return r.json(); }).then(function (r2) { return r2 && r2[0]; });
        return null;
      });
    }
    // Offline / not found: a city or PIN that appears in our own list.
    function localMatch(q) {
      var needle = q.toLowerCase().replace(/\\s+/g, " ").trim();
      var hits = (all || []).filter(function (g) {
        return (g.address + " " + Object.values(g.city || {}).join(" ")).toLowerCase().replace(/(\\d{3})\\s(\\d{3})/g, "$1$2").indexOf(needle) !== -1;
      });
      if (!hits.length) return null;
      var lat = 0, lng = 0;
      hits.forEach(function (g) { lat += g.lat; lng += g.lng; });
      return { lat: lat / hits.length, lon: lng / hits.length, display_name: q };
    }

    $("gnmForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = $("gnmQuery").value.trim();
      if (!q) { $("gnmQuery").focus(); return; }
      setStatus(fill(T.searching, { q: q }));
      $("gnmSearch").disabled = true;
      Promise.all([lookup(q).catch(function () { return null; }), load().catch(function () { return null; })]).then(function (r) {
        var place = r[0] || localMatch(q);
        if (!place) { setStatus(fill(T.notFound, { q: q }), true); return; }
        var label = (place.display_name || q).split(",").slice(0, 2).join(",");
        return showNear(+place.lat, +place.lon, label);
      }).then(function () { $("gnmSearch").disabled = false; });
    });

    Array.prototype.forEach.call(document.querySelectorAll(".quick-city"), function (b) {
      b.addEventListener("click", function () { showNear(+b.dataset.lat, +b.dataset.lng, b.textContent); });
    });
    $("gnmMore").addEventListener("click", showMore);
  })();
</script>

<script>
  (function () {
    var canonicalElem = document.querySelector('link[rel="canonical"]');
    var liveUrl = (window.location.protocol.indexOf('http') === 0)
      ? window.location.href
      : (canonicalElem ? canonicalElem.href : 'https://sikhsinindia.com');
    var rawTitle = document.title;
    var pageUrlEnc = encodeURIComponent(liveUrl);
    var pageTitleEnc = encodeURIComponent(rawTitle);
    var gsbWa = document.getElementById('gsbWhatsappShare');
    if (gsbWa) gsbWa.addEventListener('click', function () {
      window.open('https://api.whatsapp.com/send?text=' + pageTitleEnc + '%20' + pageUrlEnc, '_blank', 'noopener,noreferrer');
    });
    var gsbFb = document.getElementById('gsbFacebookShare');
    if (gsbFb) gsbFb.addEventListener('click', function () {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + pageUrlEnc, '_blank', 'noopener,noreferrer,width=600,height=400');
    });
  })();
</script>
</body>
</html>
`;
}

// Keep what seo-optimize.js adds to <head> and <body> (JSON-LD, icons,
// hreflang, the world and push blocks) when rebuilding an existing page.
function keepSeoBlocks(fresh, old) {
  if (!old) return fresh;
  let out = fresh;
  const head = [...old.matchAll(/[ \t]*<!-- seo:(jsonld|icons) -->[\s\S]*?<!-- \/seo:\1 -->\r?\n?/g)].map((m) => m[0]).join("");
  const hreflang = (old.match(/[ \t]*<link rel="alternate" hreflang=[^>]+>\r?\n?/g) || []).join("");
  if (hreflang) out = out.replace(/(<link rel="canonical"[^>]+>\n)/, `$1${hreflang}`);
  if (head) out = out.replace("</head>", `${head}</head>`);
  const body = [...old.matchAll(/<!-- seo:(world|push) -->[\s\S]*?<!-- \/seo:\1 -->\r?\n?/g)].map((m) => m[0]).join("");
  if (body) out = out.replace("</body>", `${body}</body>`);
  return out;
}

for (const lang of ["en", "hi", "pa"]) {
  const rel = lang === "en" ? REL : `${lang}/${REL}`;
  const file = path.join(ROOT, rel);
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  fs.writeFileSync(file, keepSeoBlocks(page(lang), old));
  console.log(`wrote ${rel}`);
}
