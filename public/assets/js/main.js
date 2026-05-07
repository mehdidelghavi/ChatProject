
// const loginForm = document.getElementById('loginForm');
// const loginButton = document.getElementById("loginButton");

// loginForm.addEventListener("submit", function (event) {
//     event.preventDefault();
//     const formData = new FormData(loginForm);
//     const data = Object.fromEntries(formData.entries());
//     fetch("http://localhost:3000/login", {
//         method: "POST",
//         headers: {
//             "Content-Type": "application/json"
//         },
//         body: JSON.stringify(data)
//     }).then((result) => {
//         if (result.status == 200) {
//             return result.json();
//         } else {
//             console.log("Failed");
//         }
//     }).then((data) => {
//         const token = data.token;
//         setCookie("token", token, 86400);
//     }).catch((err) => {
//         console.log(err);
//     });
// });

// function getCookie(name) {
//     let nameEQ = name + "=";
//     let ca = document.cookie.split(';');
//     for (let i = 0; i < ca.length; i++) {
//         let c = ca[i];
//         while (c.charAt(0) == ' ') c = c.substring(1, c.length);
//         if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
//     }
//     return null;
// }

// function setCookie(name, value, days) {
//     let expires = "";
//     if (days) {
//         let date = new Date();
//         date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
//         expires = "; expires=" + date.toUTCString();
//     }
//     // تنظیم کوکی با امنیت پایه
//     document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
// }