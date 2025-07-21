// const emailjs = require("@emailjs/nodejs");

// // EmailJS config
// const EMAILJS_SERVICE_ID = "service_n17cw2u";
// const EMAILJS_TEMPLATE_ID = "template_4eznr7w";
// const EMAILJS_PUBLIC_KEY = "bR8jobS4ge96abRNK";
// const EMAILJS_PRIVATE_KEY = "kcjoxRyDn2c6BAtBkV8A9";

// async function sendEmail(toEmail, message, subject, fromname, toname, fileName, occasionvar) {
//   try {
//     console.log("📤 Sending email to:", toEmail);

//     const response = await emailjs.send(
//       EMAILJS_SERVICE_ID,
//       EMAILJS_TEMPLATE_ID,
//       {
//         message,
//         subject,
//         from_name: fromname,
//         to_name: toname,
//         from_email: "someone@example.com",  // You can replace with actual sender email
//         email: toEmail,
//         link: `https://taviarora.github.io/eventmarch2025/${occasionvar}/${fileName}`,
//       },
//       {
//         publicKey: EMAILJS_PUBLIC_KEY,
//         privateKey: EMAILJS_PRIVATE_KEY,
//       }
//     );

//     console.log("✅ Email sent:", response.status, response.text);
//   } catch (error) {
//     console.error("❌ Error sending email:", error);
//   }
// }

// // Example usage: call with real data
// sendEmail(
//   "sikhsuae@gmail.com",
//   "This is your invitation message here.",
//   "Invitation to Sikhs in UAE Event",
//   "Your Website Visitor",
//   "Sikhs in UAE",
//   "invite.pdf",
//   "event2025"
// );
function sendEmail() {
  let parms = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    mobile: document.getElementById("mobile").value,
    feedback: document.getElementById("feedback").value,
  };

  emailjs.send("service_n17cw2u", "template_4eznr7w", parms)
    .then(function(response) {
      console.log("✅ SUCCESS!", response.status, response.text);
      document.getElementById("status").innerText = "Thank you! Your feedback has been sent.";
      document.getElementById("feedbackForm").reset();  // Reset the form
    })
    .catch(function(error) {
      console.error("❌ FAILED...", error);
      document.getElementById("status").innerText = "Something went wrong. Please try again.";
    });
}
