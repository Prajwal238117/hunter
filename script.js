document.getElementById("contact-form").addEventListener("submit", function (event) {
    event.preventDefault(); // Prevent actual form submission for demo purposes

    // Show the toast
    const toast = document.getElementById("toast");
    toast.classList.add("show");

    // Hide the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);

    // Optionally reset the form
    this.reset();
});
