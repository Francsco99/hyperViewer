// Function to check if the "cookiesAccepted" cookie exists
function cookiePreferenceSet() {
	return document.cookie.split('; ').some(item => item.trim().startsWith('cookiesAccepted='));
}

// Hide the disclaimer if the cookie is already set
if (cookiePreferenceSet()) {
	document.getElementById('cookieDisclaimer').style.display = 'none';
} else {
  // If no decision is made, assume non-consent after 10 seconds
  setTimeout(function() {
    if (!cookiePreferenceSet()) {
      setCookie("cookiesAccepted", "false", 365);
      document.getElementById('cookieDisclaimer').style.display = 'none';
      // Here you may also disable any non-essential cookies or tracking.
    }
  }, 10000); // 10,000 ms = 10 seconds
}

// Function to set a cookie for a given number of days
function setCookie(name, value, days) {
	let date = new Date();
	date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
	document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
}

// Handle click on "Accept" button
document.getElementById('acceptCookies').addEventListener('click', function() {
	setCookie("cookiesAccepted", "true", 365);
	document.getElementById('cookieDisclaimer').style.display = 'none';
	// Load non-essential cookies or tracking scripts if needed.
});

// Handle click on "Reject" button
document.getElementById('rejectCookies').addEventListener('click', function() {
	setCookie("cookiesAccepted", "false", 365);
	document.getElementById('cookieDisclaimer').style.display = 'none';
	// Disable non-essential cookies or tracking scripts if needed.
});
