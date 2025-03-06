document.addEventListener("DOMContentLoaded", function() {
    // Function to get a cookie value
    function getCookie(name) {
        let cookies = document.cookie.split('; ');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i].split('=');
            if (cookie[0] === name) return cookie[1];
        }
        return null;
    }

    // Function to set a cookie with a 1-year expiration
    function setCookie(name, value, days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
    }

    // Check if the tutorial has already been shown
    if (!getCookie("tutorialShown")) {
        showTutorial();
        setCookie("tutorialShown", "true", 365);  // Set the cookie for 1 year
    }

    // Aggiunge il listener all'icona info per mostrare il tutorial al click
    document.getElementById("infoIcon").addEventListener("click", showTutorial);
});

// Function to display the tutorial
function showTutorial() {
    let tutorialHtml = `
        <div id="tutorial-overlay" style="
            position: fixed; 
            top: 0; left: 0; 
            width: 100%; height: 100%; 
            background: rgba(0, 0, 0, 0.7); 
            display: flex; 
            justify-content: center; 
            align-items: center;
            z-index: 1000;">
            <div style="
                background: white; 
                padding: 25px; 
                border-radius: 15px; 
                max-width: 500px;
                text-align: center;
                box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2);">
                <h3 style="margin-bottom: 15px;">👋 Welcome to <strong>HyperViewer</strong>!</h3>
                <p>This application helps you visualize and analyze interactive graphs.</p>
                <ul style="text-align: left; font-size: 16px; line-height: 1.8;">
                    <li>📂 <strong>Upload</strong> a ZIP file containing HTML pages.</li>
                    <li>🔎 <strong>Filter</strong> nodes by their name.</li>
                    <li>💡 <strong>Toggle labels</strong> for nodes and links.</li>
                    <li>🧩 <strong>Group nodes</strong> with the same name.</li>
                    <li>👆 <strong>Click on a node</strong> to see its details.</li>
                </ul>
                <button class="btn btn-primary rounded-pill" id="close-tutorial" style="
                    margin-top: 15px; 
                    padding: 12px 25px; 
                    font-size: 16px;
                    font-weight: bold;
                    background: #007bff; 
                    color: white; 
                    border: none; 
                    cursor: pointer;
                    border-radius: 50px;
                    transition: background 0.3s;">
                    Got it! 🚀
                </button>
            </div>
        </div>`;

    document.body.insertAdjacentHTML("beforeend", tutorialHtml);

    // Function to handle ESC key press
    function handleTutorialKeydown(e) {
        if (e.key === "Escape") {
            let overlay = document.getElementById("tutorial-overlay");
            if (overlay) {
                overlay.remove();
            }
            document.removeEventListener("keydown", handleTutorialKeydown);
        }
    }

    // Aggiunge il listener per chiudere il tutorial con ESC
    document.addEventListener("keydown", handleTutorialKeydown);

    // Listener per il pulsante di chiusura del tutorial
    document.getElementById("close-tutorial").addEventListener("click", function() {
        document.getElementById("tutorial-overlay").remove();
        document.removeEventListener("keydown", handleTutorialKeydown);
    });
}
