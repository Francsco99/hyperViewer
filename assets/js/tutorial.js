document.addEventListener("DOMContentLoaded", function() {
	// Funzione per ottenere il valore di un cookie
	function getCookie(name) {
		let cookies = document.cookie.split('; ');
		for (let i = 0; i < cookies.length; i++) {
			let cookie = cookies[i].split('=');
			if (cookie[0] === name) return cookie[1];
		}
		return null;
	}

	// Funzione per impostare un cookie con scadenza (1 anno)
	function setCookie(name, value, days) {
		let date = new Date();
		date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
		document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
	}

	// Se il tutorial non è stato mostrato, lo visualizza
	if (!getCookie("tutorialShown")) {
		var tutorialModal = new bootstrap.Modal(document.getElementById('tutorialModal'));
		tutorialModal.show();
		// Salva il cookie tutorial se l'utente ha accettato i cookie
		if (getCookie("cookiesAccepted") !== "false") {
			setCookie("tutorialShown", "true", 365);
		}
	}

	// Aggiunge il listener all'icona info per mostrare il tutorial al click
	document.getElementById("infoIcon").addEventListener("click", function() {
		var tutorialModal = new bootstrap.Modal(document.getElementById('tutorialModal'));
		tutorialModal.show();
	});
});