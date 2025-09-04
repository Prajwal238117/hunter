import { showToast } from './toast.js';

// Contact form functionality
document.addEventListener('DOMContentLoaded', function() {
  const contactForm = document.getElementById('contactForm');
  
  if (contactForm) {
    contactForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        subject: document.getElementById('subject').value,
        message: document.getElementById('message').value,
        timestamp: new Date()
      };
      
      try {
        // Store in localStorage for admin to see (in real app, this would go to a database)
        const existingContacts = JSON.parse(localStorage.getItem('contactMessages') || '[]');
        existingContacts.push(formData);
        localStorage.setItem('contactMessages', JSON.stringify(existingContacts));
        
        // Show success message using toast
        showToast('Thank you! Your message has been sent successfully. We\'ll get back to you soon.', 'success');
        
        // Reset form
        contactForm.reset();
        
      } catch (error) {
        showToast('Sorry, there was an error sending your message. Please try again.', 'error');
      }
    });
  }
});
