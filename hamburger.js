    document.addEventListener('DOMContentLoaded', () => {
        const hamburgerMenu = document.querySelector('.hamburger-menu');
        const navLinks = document.querySelector('.nav-links');
        const nav = document.querySelector('.nav'); // Parent container of nav-links

        // Toggle the hamburger menu on click
        hamburgerMenu.addEventListener('click', (event) => {
            // Prevent event from propagating to the document click handler
            event.stopPropagation();
            
            // Show/hide the navigation menu and hide the hamburger icon
            navLinks.classList.toggle('active');
            hamburgerMenu.classList.toggle('hidden');
        });

        // Function to close the menu
        const closeMenu = () => {
            navLinks.classList.remove('active');
            hamburgerMenu.classList.remove('hidden');
        };

        // Close the menu when clicking outside the nav or hamburger menu (works on both mobile and desktop)
        document.addEventListener('click', (event) => {
            if (!nav.contains(event.target) && !hamburgerMenu.contains(event.target)) {
                closeMenu();
            }
        });

        // Also handle touch events on mobile devices
        document.addEventListener('touchstart', (event) => {
            if (!nav.contains(event.target) && !hamburgerMenu.contains(event.target)) {
                closeMenu();
            }
        });

        // Prevent closing the menu when clicking inside it
        navLinks.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    });
