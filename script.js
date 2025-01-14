   // Get modal elements
   const signupModal = document.getElementById("signup-modal");
   const loginModal = document.getElementById("login-modal");

   // Get open buttons
   const openSignup = document.getElementById("open-signup");
   const openLogin = document.getElementById("open-login");

   // Get close buttons
   const closeSignup = document.getElementById("closesignup");
   const closeLogin = document.getElementById("closelogin");

   // Open modals
   openSignup.addEventListener("click", () => {
       signupModal.style.display = "block";
   });

   openLogin.addEventListener("click", () => {
       loginModal.style.display = "block";
   });

   // Close modals
   closeSignup.addEventListener("click", () => {
       signupModal.style.display = "none";
   });

   closeLogin.addEventListener("click", () => {
       loginModal.style.display = "none";
   });

   // Close modals on outside click
   window.addEventListener("click", (event) => {
       if (event.target === signupModal) {
           signupModal.style.display = "none";
       }
       if (event.target === loginModal) {
           loginModal.style.display = "none";
       }
   });

   // Handle form submissions
   document.getElementById("signupform").addEventListener("submit", function (event) {
       event.preventDefault();
      
       signupModal.style.display = "none";
       this.reset();
   });

   document.getElementById("loginform").addEventListener("submit", function (event) {
       event.preventDefault();
       
       loginModal.style.display = "none";
       this.reset();
   });


   // Toast Function
function RshowToast(message) {
   const toastContainer = document.querySelector('.Rtoast-container');
   const toast = document.createElement('div');
   toast.classList.add('Rtoast');
   toast.innerHTML = `<span>${message}</span>
   <button class="Rclose-toast">&times;</button>`;

   

   // Append toast to the container
   toastContainer.appendChild(toast);

   // Show the toast
   setTimeout(() => {
       toast.classList.add('show');
   }, 100);

   // Auto-hide the toast after 3 seconds
   setTimeout(() => {
       toast.classList.remove('show');
       setTimeout(() => toast.remove(), 300); // Remove toast from DOM
   }, 3000);

   // Add close button functionality
   toast.querySelector('.Rclose-toast').addEventListener('click', () => {
       toast.classList.remove('show');
       setTimeout(() => toast.remove(), 300);
   });
}
   // Toast Function
function GshowToast(message) {
   const toastContainer = document.querySelector('.Gtoast-container');
   const toast = document.createElement('div');
   toast.classList.add('Gtoast');
   toast.innerHTML = `<span>${message}</span>
   <button class="Gclose-toast">&times;</button>`;

   

   // Append toast to the container
   toastContainer.appendChild(toast);

   // Show the toast
   setTimeout(() => {
       toast.classList.add('show');
   }, 100);

   // Auto-hide the toast after 3 seconds
   setTimeout(() => {
       toast.classList.remove('show');
       setTimeout(() => toast.remove(), 300); // Remove toast from DOM
   }, 3000);

   // Add close button functionality
   toast.querySelector('.Gclose-toast').addEventListener('click', () => {
       toast.classList.remove('show');
       setTimeout(() => toast.remove(), 300);
   });
}



async function signup(e) {
    e.preventDefault();
    const email = document.querySelector('#signupemail');
    const password = document.querySelector('#signuppassword');

    if (!email.value || !password.value) {
        RshowToast('Please fill in all fields');
        return;
    }

    try {
        const result = await firebase.auth().createUserWithEmailAndPassword(email.value, password.value);
        await result.user.updateProfile({ displayName: "User" });
        createUserCollection(result.user);
        await result.user.sendEmailVerification();
        GshowToast('Sign-Up Successful! Check your email for verification.');
    } catch (err) {
        RshowToast(err.message || 'Unable to Sign-Up');
    }
}


async function login(e) {
   e.preventDefault();
   const email = document.querySelector('#loginemail');
   const password = document.querySelector('#loginpassword');
   console.log(email.value, password.value);

   if (!email.value || !password.value) {
    RshowToast('Please fill in all fields');
    return;
}

   try {
       const result = await firebase.auth().signInWithEmailAndPassword(email.value, password.value);
       console.log(result);
       GshowToast('Logged In Sucessfully');
               
   } catch (err) {
       RshowToast('Unable To Login');
   }
}


function logout() {
    firebase.auth().signOut()

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        console.log('User signed in:', user);
    } else {
        console.log('User signed out, showing toast');
        GshowToast('Sign Out Success.');
    }
});

}





function createUserCollection(user){
   firebase.firestore().collection ('Oders')
   .doc(user.uid)
   .set({
     
       uid:document.getElementById("modal-body-text-uid"),
       
   })
}

