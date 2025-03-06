document.getElementById("getStartedBtn").addEventListener("click", function(e) {
    e.preventDefault(); // Previene il comportamento di default
    anime({
        targets: 'body',
        opacity: [1, 0],
        duration: 1000,
        easing: 'easeInOutQuad',
        complete: function() {
            window.location.href = "graph.html";
        }
    });
});