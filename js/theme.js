/* Apply the saved theme before first paint to avoid a flash. */
(() => {
  try {
    const theme = localStorage.getItem("cortex.theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  } catch (error) {
    /* storage blocked — keep the default dark theme */
  }
})();
