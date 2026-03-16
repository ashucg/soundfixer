'use strict'

let tid = 0
const frameMap = new Map()
const elementsList = document.getElementById('elements-list')
const allElements = document.getElementById('all-elements')
const indivElements = document.getElementById('individual-elements')
const elementsTpl = document.getElementById('elements-tpl')
const defaultSettings = { gain: 1, pan: 0, mono: false, flip: false };
let currentDomain = false;

function applySettings (fid, elid, newSettings) {
	browser.tabs.sendMessage(tid, {
		action: "applySettings",
		frameId: fid,
		elid: elid,
		newSettings: newSettings
	});
}

async function getDomainSettings() {
	const storedSettings = await browser.storage.local.get(currentDomain);
	return storedSettings[currentDomain];
}

browser.tabs.query({ currentWindow: true, active: true }).then(tabs => {
	tid = tabs[0].id
	currentDomain = (new URL(tabs[0].url)).hostname;
	return browser.webNavigation.getAllFrames({ tabId: tid }).then(frames =>
		Promise.all(frames.map(frame => {
			const fid = frame.frameId
			return browser.tabs.executeScript(tid, { frameId: fid, code: `(function () {
				const result = new Map()
				for (const el of document.querySelectorAll('video, audio')) {
					result.set(el.getAttribute('data-x-soundfixer-id'), {
						type: el.tagName.toLowerCase(),
						isPlaying: (el.currentTime > 0 && !el.paused && !el.ended && el.readyState > 2),
						settings: el.xSoundFixerSettings
					})
				}
				return result
			})()` }).then(result => frameMap.set(fid, result[0]))
			.catch(err => console.error(`tab ${tid} frame ${fid}`, err))
		}))
	)
}).then(async () => {
	elementsList.textContent = ''
	let elCount = 0
	const domainSettings = await getDomainSettings();
	for (const [fid, els] of frameMap) {
		for (const [elid, el] of els) {
			const settings = el.settings || {}
			const node = document.createElement('li')
			node.appendChild(document.importNode(elementsTpl.content, true))
			node.querySelector('.domain-btn-row').remove();
			node.dataset.fid = fid
			node.dataset.elid = elid
			node.querySelector('.element-label').textContent = `
				${el.type.charAt(0).toUpperCase() + el.type.slice(1)}
				${elCount + 1}
				${fid ? `in frame ${fid}` : ''}
				${el.isPlaying ? '' : '(not playing)'}
			`
			if (!el.isPlaying)
				node.querySelector('.element-label').classList.add('element-not-playing')
			const gain = node.querySelector('.element-gain')
			const gainNumberInput = node.querySelector('.element-gain-num')
			gain.value = (settings.gain || 1).toFixed(2)
			gain.parentElement.querySelector('.element-gain-num').value = gain.value
			gain.addEventListener('input', function () {
				// We used a function expression thus gain === this
				applySettings(fid, elid, { gain: this.value })
				this.parentElement.querySelector('.element-gain-num').value = (+this.value).toFixed(2)
			})
			gainNumberInput.addEventListener('input', function () {
				if (+this.value > +this.getAttribute('max'))
					this.value = this.getAttribute('max')
				if (+this.value < +this.getAttribute('min'))
					this.value = this.getAttribute('min')

				applySettings(fid, elid, { gain: this.value })
				this.parentElement.querySelector('.element-gain').value = (+this.value).toFixed(2)
			})
			const pan = node.querySelector('.element-pan')
			const panNumberInput = node.querySelector('.element-pan-num')
			pan.value = (settings.pan || 0).toFixed(2)
			pan.parentElement.querySelector('.element-pan-num').value = pan.value
			pan.addEventListener('input', function () {
				applySettings(fid, elid, { pan: this.value })
				this.parentElement.querySelector('.element-pan-num').value = (+this.value).toFixed(2)
			})
			panNumberInput.addEventListener('input', function () {
				if (+this.value > +this.getAttribute('max'))
					this.value = this.getAttribute('max')
				if (+this.value < +this.getAttribute('min'))
					this.value = this.getAttribute('min')

				applySettings(fid, elid, { pan: this.value })
				this.parentElement.querySelector('.element-pan').value = (+this.value).toFixed(2)
			})
			const mono = node.querySelector('.element-mono')
			mono.checked = settings.mono || false
			mono.addEventListener('change', _ => {
				applySettings(fid, elid, { mono: mono.checked })
			})
			const flip = node.querySelector('.element-flip')
			flip.checked = settings.flip || false
			flip.addEventListener('change', _ => {
				applySettings(fid, elid, { flip: flip.checked })
			})
			node.querySelector('.element-reset').onclick = function () {
				gain.value = 1
				gain.parentElement.querySelector('.element-gain-num').value = '' + gain.value
				pan.value = 0
				pan.parentElement.querySelector('.element-pan-num').value = '' + pan.value
				mono.checked = false
				flip.checked = false
				applySettings(fid, elid, defaultSettings)
			}
			elementsList.appendChild(node)
			elCount += 1
		}
	}
	if (elCount === 0) {
			allElements.innerHTML = 'No audio/video found in the current tab. Note that some websites do not work because of cross-domain security restrictions.'
			indivElements.remove()
	} else {
			// Simple solution: use the first element's settings for 'All media' controls
			let firstSettings = domainSettings || defaultSettings;
			for (const [, els] of frameMap) {
				for (const [, el] of els) {
					if (el.settings) {
						firstSettings = {
							gain: el.settings.gain ?? 1,
							pan: el.settings.pan ?? 0,
							mono: el.settings.mono ?? false,
							flip: el.settings.flip ?? false
						}
						break
					}
				}
				break
			}
			const node = document.createElement('div')
			node.appendChild(document.importNode(elementsTpl.content, true))
			node.querySelector('.element-label').textContent = `All media on the page`
			const gain = node.querySelector('.element-gain')
			const gainNumberInput = node.querySelector('.element-gain-num')
			gain.value = (firstSettings?.gain || 1).toFixed(2);
			gainNumberInput.value = '' + gain.value
			function applyGain (value) {
				for (const [fid, els] of frameMap) {
					for (const [elid, el] of els) {
						applySettings(fid, elid, { gain: value })
						const egain = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-gain`)
						if (egain) {
							egain.value = value
							egain.parentElement.querySelector('.element-gain-num').value = '' + value
						}
					}
				}
				gain.value = (+value).toFixed(2)
				gainNumberInput.value = (+value).toFixed(2)
			}
			gain.addEventListener('input', _ => applyGain(gain.value))
			gainNumberInput.addEventListener('input', function () {
				if (+this.value > +this.getAttribute('max'))
					this.value = this.getAttribute('max')
				if (+this.value < +this.getAttribute('min'))
					this.value = this.getAttribute('min')
				applyGain(+this.value)
			})
			const pan = node.querySelector('.element-pan')
			const panNumberInput = node.querySelector('.element-pan-num')
			pan.value = firstSettings?.pan || 0;
			panNumberInput.value = (+pan.value).toFixed(2)
			function applyPan (value) {
				for (const [fid, els] of frameMap) {
					for (const [elid, el] of els) {
						applySettings(fid, elid, { pan: value })
						const epan = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan`)
						if (epan) {
							epan.value = value
							epan.parentElement.querySelector('.element-pan-num').value = '' + value
						}
					}
				}
				pan.value = (+value).toFixed(2)
				panNumberInput.value = (+value).toFixed(2)
			}
			pan.addEventListener('input', _ => applyPan(pan.value))
			panNumberInput.addEventListener('input', function () {
				if (+this.value > +this.getAttribute('max'))
					this.value = this.getAttribute('max')
				if (+this.value < +this.getAttribute('min'))
					this.value = this.getAttribute('min')
				applyPan(+this.value)
			})
			const mono = node.querySelector('.element-mono')
			mono.checked = firstSettings?.mono || false
			mono.addEventListener('change', _ => {
				for (const [fid, els] of frameMap) {
					for (const [elid, el] of els) {
						applySettings(fid, elid, { mono: mono.checked })
						const emono = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-mono`)
						if (emono) emono.checked = mono.checked
					}
				}
			})
			const flip = node.querySelector('.element-flip')
			flip.checked = firstSettings?.flip || false
			flip.addEventListener('change', _ => {
				for (const [fid, els] of frameMap) {
					for (const [elid, el] of els) {
						applySettings(fid, elid, { flip: flip.checked })
						const eflip = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-flip`)
						if (eflip) eflip.checked = flip.checked
					}
				}
			})
			node.querySelector('.element-reset').onclick = function () {
				gain.value = 1
				gain.parentElement.querySelector('.element-gain-num').value = '1'
				pan.value = 0
				pan.parentElement.querySelector('.element-pan-num').value = '0'
				mono.checked = false
				flip.checked = false
				for (const [fid, els] of frameMap) {
					for (const [elid, el] of els) {
						const egain = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-gain`)
						if (egain) {
							egain.value = 1
							egain.parentElement.querySelector('.element-gain-num').value = '1'
						}
						const epan = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan`)
						if (epan) {
							epan.value = 0
							epan.parentElement.querySelector('.element-pan-num').value = '0'
						}
						const emono = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-mono`)
						if (emono) emono.checked = false
						const eflip = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-flip`)
						if (eflip) eflip.checked = false
						applySettings(fid, elid, { gain: 1, pan: 0, mono: false, flip: false })
					}
				}
			}
			if (node.querySelector('.domain-btn-row') && currentDomain) {
				node.querySelector('.element-save-default').onclick = async function () {
					const domainSettings = {
						gain: Number(gain.value),
						pan: Number(pan.value),
						mono: mono.checked,
						flip: flip.checked,
					};
					await browser.storage.local.set({ [currentDomain]: domainSettings });
				}
				node.querySelector('.element-reset-default').onclick = async function () {
					await browser.storage.local.remove([currentDomain]);
				}
			}
			allElements.appendChild(node)
	}
})
