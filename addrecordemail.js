function sendEmail() {
            const email = document.getElementById("email").value.trim();
            const name = document.getElementById("name").value.trim();
            const mobile = document.getElementById("mobile").value.trim();
            const age = document.getElementById("age").value.trim();
            const address = document.getElementById("address").value.trim();
            const gender = document.getElementById("gender").value;

            const emailParams = {
                email: email,
                name: name,
                mobile: mobile,
                age: age,
                address: address,
                gender: gender
            };

            emailjs.send("service_p8xn1qd", "template_tieidup", emailParams)
                .then(response => {
                    console.log("✅ Email sent successfully:", response.status, response.text);
                })
                .catch(error => {
                    console.error("❌ Failed to send email:", error);
                    document.getElementById("status").innerText = "Error sending email: " + error.message;
                });
        }