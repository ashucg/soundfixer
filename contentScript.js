'use strict';

const defaultSettings = { gain: 1, pan: 0, mono: false, flip: false };
let domainSettings = defaultSettings;

async function getDomainSettings() {
	const currentDomain = window.location.hostname;
	const storedSettings = await browser.storage.local.get(currentDomain);
	return storedSettings[currentDomain];
}

async function applySettings(elemOrSelector, newSettings) {
	const el = typeof elemOrSelector === 'string' ? document.querySelector(`[data-x-soundfixer-id="${elemOrSelector}"]`) : elemOrSelector;
	if (!el) { return; }
	attachId(el);
	if (!el.xSoundFixerContext) {
		el.xSoundFixerContext = new AudioContext()
		el.xSoundFixerGain = el.xSoundFixerContext.createGain()
		el.xSoundFixerPan = el.xSoundFixerContext.createStereoPanner()
		el.xSoundFixerSplit = el.xSoundFixerContext.createChannelSplitter(2)
		el.xSoundFixerMerge = el.xSoundFixerContext.createChannelMerger(2)
		el.xSoundFixerSource = el.xSoundFixerContext.createMediaElementSource(el)
		el.xSoundFixerSource.connect(el.xSoundFixerGain)
		el.xSoundFixerGain.connect(el.xSoundFixerPan)
		el.xSoundFixerPan.connect(el.xSoundFixerContext.destination)
		el.xSoundFixerOriginalChannels = el.xSoundFixerContext.destination.channelCount
	}
	if (el.xSoundFixerContext.state === 'suspended') {
		el.xSoundFixerContext.resume();
	}
	if ('gain' in newSettings) {
		el.xSoundFixerGain.gain.value = newSettings.gain
	}
	if ('pan' in newSettings) {
		el.xSoundFixerPan.pan.value = newSettings.pan
	}
	if ('mono' in newSettings) {
		el.xSoundFixerContext.destination.channelCount = newSettings.mono ? 1 : el.xSoundFixerOriginalChannels
	}
	if ('flip' in newSettings) {
		el.xSoundFixerFlipped = newSettings.flip
		el.xSoundFixerMerge.disconnect()
		el.xSoundFixerPan.disconnect()
		if (el.xSoundFixerFlipped) {
			el.xSoundFixerPan.connect(el.xSoundFixerSplit)
			el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 0, 1)
			el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 1, 0)
			el.xSoundFixerMerge.connect(el.xSoundFixerContext.destination)
		} else {
			el.xSoundFixerPan.connect(el.xSoundFixerContext.destination)
		}
	}
	el.xSoundFixerSettings = {
		gain: el.xSoundFixerGain.gain.value,
		pan: el.xSoundFixerPan.pan.value,
		mono: el.xSoundFixerContext.destination.channelCount == 1,
		flip: el.xSoundFixerFlipped,
	}
}

// Just a small helper to add id attribute if it doesn't exist
function attachId(el) {
	if (!el.hasAttribute('data-x-soundfixer-id')) {
		el.setAttribute('data-x-soundfixer-id', Math.random().toString(36).substr(2, 10));
		// Try to fix some sites that use Sec-Fetch-Mode: no-cors even when the server
		// sends the correct CORS headers
		if (el.src && !el.crossOrigin) {
			const currentSrc = el.src;
			el.crossOrigin = 'anonymous';

			// Force the browser to re-fetch the resource with CORS headers
			el.src = currentSrc;
			el.load();
		}
	}
}

async function applySettingsToElements() {
	domainSettings = await getDomainSettings();
	for (const el of document.querySelectorAll('video, audio')) {
		attachId(el)
		if (domainSettings) applySettings(el, domainSettings);
	}
}

applySettingsToElements();

// MutationObserver helps in cases when new media elements are added to the page
const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		// Handle new elements being added
		if (mutation.type === 'childList') {
			mutation.addedNodes.forEach(node => {
				if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
					handleNewMedia(node);
				} else if (node.querySelectorAll) {
					// Check if the added node contains media (like a div wrapper)
					node.querySelectorAll('video, audio').forEach(handleNewMedia);
				}
			});
		} // Handle existing elements getting a new 'src' via JS navigation
		else if (mutation.type === 'attributes' && (mutation.target.nodeName === 'VIDEO' || mutation.target.nodeName === 'AUDIO')) {
			if (mutation.attributeName === 'src' || mutation.attributeName === 'data-src') {
				handleNewMedia(mutation.target);
			}
		}
	}
});

observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

async function handleNewMedia(el) {
	// 1. Apply the CORS fix immediately
	if (el.crossOrigin !== 'anonymous') {
		el.crossOrigin = 'anonymous';
		// Only reload if there's already a src
		if (el.src) {
			const currentSrc = el.src;
			el.src = currentSrc;
			el.load();
		}
	}
	// 2. Attach ID and Apply Settings
	attachId(el);
	domainSettings = await getDomainSettings();
	if (domainSettings) {
		applySettings(el, domainSettings);
	}
}

function getCurrentFrameId() {
	// Important to get the correct frame ID to apply settings from individual media settings
	// Fallback to 0 is important, which refers to the top-level frame
	return browser.runtime.getFrameId(window.self) || 0;
}

// Use messages to apply settings from popup instead of applying the same logic there
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "applySettings" && message.frameId === getCurrentFrameId()) {
		applySettings(message.elid, message.newSettings);
	}
});
