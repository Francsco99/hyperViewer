// Function to check if the "cookiesAccepted" cookie exists
function cookiePreferenceSet() {
	return document.cookie.split('; ').some(item => item.trim().startsWith('cookiesAccepted='));
}

// Hide the disclaimer if the cookie is already set
if (cookiePreferenceSet()) {
	document.getElementById('cookieDisclaimer').style.display = 'none';
}

// Function to set a cookie for 1 year
function setCookie(name, value, days) {
	let date = new Date();
	date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
	document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
}

// Handle click on "Accept" button
document.getElementById('acceptCookies').addEventListener('click', function() {
	setCookie("cookiesAccepted", "true", 365);
	document.getElementById('cookieDisclaimer').style.display = 'none';
});

// Handle click on "Reject" button
document.getElementById('rejectCookies').addEventListener('click', function() {
	setCookie("cookiesAccepted", "false", 365);
	document.getElementById('cookieDisclaimer').style.display = 'none';
	// Optionally, add actions for when the user rejects cookies.
});