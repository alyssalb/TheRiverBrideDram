// script.js

// This will handle navigation and dynamic loading if needed
// Currently sets up section toggling or dynamic behavior

document.addEventListener("DOMContentLoaded", () => {
  const navLinks = document.querySelectorAll("nav a");
  const sections = document.querySelectorAll("section");

  navLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const targetId = link.getAttribute("href").substring(1);
      sections.forEach(section => {
        section.style.display = section.id === targetId ? "block" : "none";
      });
    });
  });

  // Initially show only the first section
  sections.forEach((section, i) => {
    section.style.display = i === 0 ? "block" : "none";
  });
});
