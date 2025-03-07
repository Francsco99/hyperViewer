// ============================================
// 1. GLOBAL STATE & COSTANTI
// ============================================
const state = {
	selectedNode: null,
	showNodeLabels: true,
	showLinkLabels: false,
	groupingEnabled: false,
	fixNodesOnDrag: false
};

const dataState = {
	nodesData: [],
	linksData: [],
	filteredNodes: [],
	filteredLinks: [],
	originalNodesData: [],
	originalLinksData: []
};

const DEFAULT_LINK_DISTANCE = 300;
const DEFAULT_CHARGE_STRENGTH = -600;
document.getElementById("linkDistanceSlider").value = DEFAULT_LINK_DISTANCE;
document.getElementById("chargeStrengthSlider").value = DEFAULT_CHARGE_STRENGTH;

// ============================================
// 2. FUNZIONI UTILITY
// ============================================
/**
 * Risolve un percorso relativo in base al percorso base.
 */
function resolvePath(base, href) {
	let baseParts = base.split("/").slice(0, -1);
	let hrefParts = href.split("/");
	let path = baseParts.concat(hrefParts).join("/");
	return path.replace(/\/\.\//g, "/").replace(/\/[^/]+\/\.\.\//g, "/");
}

/**
 * Binding unificato degli eventi per un elemento.
 */
function bindEvent(elementId, event, handler) {
	const el = document.getElementById(elementId);
	if (el) el.addEventListener(event, handler);
}

/**
 * Aggiorna il badge che mostra il numero di switch attivi.
 */
function updateActiveCounter() {
	let count = 0;
	if (document.getElementById("toggleNodeLabels").checked) count++;
	if (document.getElementById("toggleLinkLabels").checked) count++;
	if (document.getElementById("toggleGrouping").checked) count++;
	if (document.getElementById("toggleFixNodes").checked) count++;
	document.getElementById("activeCounterBadge").innerText = count;
}

/**
 * Resetta un singolo switch al valore di default.
 */
function resetSwitch(switchId, defaultValue) {
	const el = document.getElementById(switchId);
	if (el) el.checked = defaultValue;
}

/**
 * Binding degli slider per aggiornare le forze della simulazione.
 */
function bindSlider(sliderId, forceName, attr, defaultVal) {
	bindEvent(sliderId, "input", function() {
		const newVal = +this.value;
		if (simulation && simulation.force(forceName)) {
			simulation.force(forceName)[attr](newVal);
			simulation.alpha(1).restart();
		}
	});
}

// ============================================
// 3. ELABORAZIONE DEI DATI & FUNZIONI DI RAGGRUPPAMENTO
// ============================================
function groupGraphData(nodes, links) {
	const groupMapping = {};
	const groupedNodesObj = {};

	nodes.forEach(node => {
		let groupId;
		if (node.id.charAt(0) === "#" && node.baseFile) {
			groupId = node.baseFile;
		} else {
			groupId = node.id.split("#")[0];
		}
		groupMapping[node.id] = groupId;

		if (!groupedNodesObj[groupId]) {
			groupedNodesObj[groupId] = {
				id: groupId,
				label: groupId,
				originalNodes: [node]
			};
		} else {
			groupedNodesObj[groupId].originalNodes.push(node);
		}
	});

	const groupedNodes = Object.values(groupedNodesObj);
	const groupedLinksObj = {};

	links.forEach(link => {
		const src = (typeof link.source === "object") ? link.source.id : link.source;
		const tgt = (typeof link.target === "object") ? link.target.id : link.target;
		const groupSrc = groupMapping[src];
		const groupTgt = groupMapping[tgt];
		if (groupSrc !== groupTgt) {
			const key = groupSrc + "->" + groupTgt;
			if (!groupedLinksObj[key]) {
				groupedLinksObj[key] = {
					source: groupSrc,
					target: groupTgt,
					label: "",
					originalLinks: [link]
				};
			} else {
				groupedLinksObj[key].originalLinks.push(link);
			}
		}
	});

	const groupedLinks = Object.values(groupedLinksObj);
	return {
		nodes: groupedNodes,
		links: groupedLinks
	};
}

/**
 * Processa il file ZIP contenente le pagine HTML e crea i dati per il grafo.
 */
async function processZip(zip) {
	const nodes = {};
	const links = [];

	for (const fileName of Object.keys(zip.files)) {
		if (fileName.endsWith(".html")) {
			const content = await zip.files[fileName].async("text");
			const parser = new DOMParser();
			const doc = parser.parseFromString(content, "text/html");

			// Crea il nodo per il file HTML
			nodes[fileName] = {
				id: fileName,
				label: fileName
			};

			// Processa gli href della pagina
			doc.querySelectorAll("a[href]").forEach(link => {
				const href = link.getAttribute("href");
				const text = link.textContent.trim() || "link";

				if (href.startsWith("http")) {
					nodes["web"] = {
						id: "web",
						label: "Web"
					};
					links.push({
						source: fileName,
						target: "web",
						label: text
					});
				} else if (href.charAt(0) === "#") {
					if (!nodes[href]) {
						nodes[href] = {
							id: href,
							label: href,
							isAnchor: true,
							baseFile: fileName
						};
					} else {
						nodes[href].isAnchor = true;
						if (!nodes[href].baseFile) {
							nodes[href].baseFile = fileName;
						}
					}
					links.push({
						source: fileName,
						target: href,
						label: text
					});
				} else {
					const targetFile = resolvePath(fileName, href);
					if (!nodes[targetFile]) nodes[targetFile] = {
						id: targetFile,
						label: targetFile
					};
					links.push({
						source: fileName,
						target: targetFile,
						label: text
					});
				}
			});
		}
	}

	// Imposta i dati nello stato globale
	dataState.nodesData = Object.values(nodes);
	dataState.linksData = links;
	dataState.originalNodesData = dataState.nodesData;
	dataState.originalLinksData = dataState.linksData;

	if (state.groupingEnabled) {
		const grouped = groupGraphData(dataState.originalNodesData, dataState.originalLinksData);
		dataState.nodesData = grouped.nodes;
		dataState.linksData = grouped.links;
	}

	dataState.filteredNodes = dataState.nodesData;
	dataState.filteredLinks = dataState.linksData;
	visualizeGraph(dataState.filteredNodes, dataState.filteredLinks);
}

// ============================================
// 4. VISUALIZZAZIONE DEL GRAFO CON D3
// ============================================
function visualizeGraph(nodes, links) {
	const svg = d3.select("svg");
	svg.selectAll("*").remove();
	const width = document.getElementById("graph-container").clientWidth;
	const height = document.getElementById("graph-container").clientHeight;
	svg.attr("width", width).attr("height", height);

	// Container per zoom e panning
	const container = svg.append("g");

	svg.call(d3.zoom()
		.scaleExtent([0.1, 4])
		.on("zoom", event => container.attr("transform", event.transform))
	);

	const linkGroup = container.append("g").attr("class", "links");
	const nodeGroup = container.append("g").attr("class", "nodes");

	simulation = d3.forceSimulation(nodes)
		.force("link", d3.forceLink(links).id(d => d.id).distance(DEFAULT_LINK_DISTANCE))
		.force("charge", d3.forceManyBody().strength(DEFAULT_CHARGE_STRENGTH))
		.force("center", d3.forceCenter(width / 2, height / 2))
		.force("x", d3.forceX(width / 2).strength(0.05))
		.force("y", d3.forceY(height / 2).strength(0.05));

	const link = linkGroup.selectAll("line")
		.data(links)
		.enter().append("line")
		.attr("class", "link");

	const linkText = linkGroup.selectAll("text")
		.data(links)
		.enter().append("text")
		.attr("class", "link-label")
		.attr("dy", -5)
		.attr("text-anchor", "middle")
		.style("font-size", "12px")
		.text(d => d.label)
		.style("display", state.showLinkLabels ? "block" : "none");

	const nodeSelection = nodeGroup.selectAll("circle")
		.data(nodes)
		.enter().append("circle")
		.attr("class", d => {
			if (d.id === "web") return "node web";
			return d.isAnchor ? "node anchor-node" : "node normal-node";
		})
		.attr("r", 10)
		.on("click", (event, d) => {
			event.stopPropagation();
			selectNode(d.id, link, nodeSelection);
		})
		.on("mouseover", (event, d) => {
			d3.select("#tooltip")
				.style("left", event.pageX + 5 + "px")
				.style("top", event.pageY + 5 + "px")
				.style("display", "block")
				.html(`Node: ${d.label}`);
		})
		.on("mouseout", () => d3.select("#tooltip").style("display", "none"))
		.call(d3.drag()
			.on("start", dragStarted)
			.on("drag", dragged)
			.on("end", dragEnded)
		);

	const nodeText = nodeGroup.selectAll(".node-label")
		.data(nodes)
		.enter().append("text")
		.text(d => d.label)
		.attr("class", "node-label")
		.attr("dy", -15)
		.attr("text-anchor", "middle")
		.style("font-size", "12px")
		.style("display", state.showNodeLabels ? "block" : "none");

	// Gestione tooltip per i link
	link.on("mouseover", function(event, d) {
			const sameLinks = dataState.linksData.filter(linkObj => {
				const src = (typeof linkObj.source === "object") ? linkObj.source.id : linkObj.source;
				const tgt = (typeof linkObj.target === "object") ? linkObj.target.id : linkObj.target;
				return src === d.source.id && tgt === d.target.id;
			});
			let tooltipContent = `<strong>Link: ${d.source.id} → ${d.target.id}</strong>`;
			if (sameLinks.length > 1) {
				tooltipContent += "<ul>";
				sameLinks.forEach(linkObj => {
					tooltipContent += `<li>${linkObj.label}</li>`;
				});
				tooltipContent += "</ul>";
			} else {
				tooltipContent += `<br>${d.label}`;
			}
			d3.select("#tooltip")
				.style("left", event.pageX + 5 + "px")
				.style("top", event.pageY + 5 + "px")
				.style("display", "block")
				.html(tooltipContent);
		})
		.on("mouseout", () => d3.select("#tooltip").style("display", "none"));

	svg.on("click", () => deselectNode(link, nodeSelection));

	simulation.on("tick", () => {
		link.attr("x1", d => d.source.x)
			.attr("y1", d => d.source.y)
			.attr("x2", d => d.target.x)
			.attr("y2", d => d.target.y);

		linkText.attr("x", d => (d.source.x + d.target.x) / 2)
			.attr("y", d => (d.source.y + d.target.y) / 2);

		nodeSelection.attr("cx", d => d.x)
			.attr("cy", d => d.y);

		nodeText.attr("x", d => d.x)
			.attr("y", d => d.y);
	});
}

// ============================================
// 5. GESTIONE DEGLI EVENTI DI DRAG & DROP & NODE SELECTION
// ============================================
function dragStarted(event, d) {
	if (!event.active) simulation.alphaTarget(0.3).restart();
	d.fx = d.x;
	d.fy = d.y;
}

function dragged(event, d) {
	d.fx = event.x;
	d.fy = event.y;
}

function dragEnded(event, d) {
	if (!event.active) simulation.alphaTarget(0);
	if (!state.fixNodesOnDrag) {
		d.fx = null;
		d.fy = null;
	}
}

function selectNode(id, linkSelection, nodeSelection) {
	state.selectedNode = id;
	nodeSelection.classed("selected", d => d.id === id);
	linkSelection.classed("highlighted", d => d.source.id === id);

	d3.selectAll(".node-label").classed("bold-label", false);
	d3.selectAll(".node-label")
		.filter(d => d.id === id)
		.classed("bold-label", true);

	const nodeInfoContainer = document.getElementById("node-info");
	nodeInfoContainer.style.display = "block";

	const groupNode = dataState.nodesData.find(n => n.id === id && n.originalNodes);
	const sourceIds = groupNode ? groupNode.originalNodes.map(n => n.id) : [id];
	const outgoingLinks = dataState.originalLinksData.filter(linkObj => {
		const src = (typeof linkObj.source === "object") ? linkObj.source.id : linkObj.source;
		return sourceIds.includes(src);
	});

	let contentHTML = `
        <div class="card shadow-sm">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">Node Details</h5>
                <button id="close-node-info" type="button" class="btn-close" aria-label="Close"></button>
            </div>
            <div class="card-body">
                <p class="card-text"><strong>ID:</strong> ${id}</p>
                ${
                  outgoingLinks.length > 0 
                  ? `
                <h6 class="mt-3">Outgoing Links <i class="bi bi-arrow-right"></i></h6>
                <div class="overflow-auto" style="max-height: 60vh;">
                    <ul class="list-group list-group-flush">
                        ${outgoingLinks.map(linkObj => {
                            const src = (typeof linkObj.source === "object") ? linkObj.source.id : linkObj.source;
                            const tgt = (typeof linkObj.target === "object") ? linkObj.target.id : linkObj.target;
                            // Determina il colore in base al tipo di nodo target
                            const targetNode = dataState.nodesData.find(node => node.id === tgt);
                            let targetColor = 'inherit';
                            if (targetNode) {
                                if (targetNode.id === "web") {
                                    targetColor = "var(--node-web-color)";
                                } else if (targetNode.isAnchor) {
                                    targetColor = "var(--node-anchor-color)";
                                } else {
                                    targetColor = "var(--node-normal-color)";
                                }
                            }
                            return `
                            <li class="list-group-item d-flex justify-content-between align-items-center link-item" 
                                data-source="${src}" data-target="${tgt}" style="cursor: pointer;">
                                <div data-bs-toggle="tooltip" title="Highlight Link">
                                    <strong>${tgt}</strong><br>
                                    <small class="text-muted">${linkObj.label}</small>
                                </div>
                                <i class="bi bi-arrow-right-circle follow-link-btn" 
                                   data-bs-toggle="tooltip" title="Select Node"
                                   data-target="${tgt}" 
                                   style="font-size: 1.3rem; cursor: pointer; color: ${targetColor};"></i>
                            </li>
                            `;
}).join('')
} <
/ul> <
/div>
` 
                  : ` < p class = "mt-3" > No outgoing links < /p>`
} <
/div> <
/div>
`;

    nodeInfoContainer.innerHTML = contentHTML;

    // Reinizializza i tooltip per gli elementi dinamici
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    bindEvent("close-node-info", "click", () => {
        nodeInfoContainer.style.display = "none";
        deselectNode(linkSelection, nodeSelection);
    });

    document.querySelectorAll(".link-item").forEach(item => {
        item.addEventListener("click", function() {
            document.querySelectorAll(".link-item").forEach(li => li.classList.remove("active"));
            this.classList.add("active");
            d3.selectAll(".link").classed("selected", false);
            const src = this.getAttribute("data-source");
            const tgt = this.getAttribute("data-target");
            linkSelection.filter(d => {
                const dSrc = (typeof d.source === "object") ? d.source.id : d.source;
                const dTgt = (typeof d.target === "object") ? d.target.id : d.target;
                return dSrc === src && dTgt === tgt;
            }).classed("selected", true);
        });
    });

    document.querySelectorAll(".follow-link-btn").forEach(button => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            // Nascondi la tooltip attiva sull'icona
            const tooltipInstance = bootstrap.Tooltip.getInstance(button);
            if (tooltipInstance) {
                tooltipInstance.hide();
            }
            const targetId = button.getAttribute("data-target");
            selectNode(targetId, linkSelection, nodeSelection);
        });
    });
}

function deselectNode(linkSelection, nodeSelection) {
state.selectedNode = null;
nodeSelection.classed("selected", false);
linkSelection.classed("highlighted selected", false);
document.getElementById("node-info").style.display = "none";
}

// ============================================
// 6. FUNZIONI DI SETUP DELL'INTERFACCIA UTENTE
// ============================================
function initUI() {
// Caricamento file ZIP
bindEvent("fileInput", "change", function(event) {
    resetFormSwitches();
    const file = event.target.files[0];
    if (file) {
    document.getElementById("resetLayoutBtn").disabled = false;
    const reader = new FileReader();
    reader.onload = e => {
        JSZip.loadAsync(e.target.result).then(zip => processZip(zip));
    };
    reader.readAsArrayBuffer(file);
    }
});

// Ricerca dei nodi
bindEvent("searchInput", "input", function(event) {
    const searchText = event.target.value.toLowerCase();
    if (searchText === "") {
    dataState.filteredNodes = dataState.nodesData;
    dataState.filteredLinks = dataState.linksData;
    } else {
    const searchedNode = dataState.nodesData.find(node => node.label.toLowerCase().includes(searchText));
    if (searchedNode) {
        const visibleNodes = new Set();
        visibleNodes.add(searchedNode.id);
        dataState.linksData.forEach(link => {
        if (link.source.id === searchedNode.id) visibleNodes.add(link.target.id);
        if (link.target.id === searchedNode.id) visibleNodes.add(link.source.id);
        });
        dataState.filteredNodes = dataState.nodesData.filter(node => visibleNodes.has(node.id));
        dataState.filteredLinks = dataState.linksData.filter(link => visibleNodes.has(link.source.id) && visibleNodes.has(link.target.id));
    } else {
        dataState.filteredNodes = [];
        dataState.filteredLinks = [];
    }
    }
    visualizeGraph(dataState.filteredNodes, dataState.filteredLinks);
});

// Gestione form-switch in modo unificato
["toggleNodeLabels", "toggleLinkLabels", "toggleGrouping", "toggleFixNodes"].forEach(switchId => {
    bindEvent(switchId, "change", function() {
    const checked = this.checked;
    switch (switchId) {
        case "toggleNodeLabels":
        state.showNodeLabels = checked;
        d3.selectAll(".node-label").style("display", checked ? "block" : "none");
        break;
        case "toggleLinkLabels":
        state.showLinkLabels = checked;
        d3.selectAll(".link-label").style("display", checked ? "block" : "none");
        break;
        case "toggleGrouping":
        state.groupingEnabled = checked;
        if (checked) {
            const grouped = groupGraphData(dataState.originalNodesData, dataState.originalLinksData);
            dataState.nodesData = grouped.nodes;
            dataState.linksData = grouped.links;
        } else {
            dataState.nodesData = dataState.originalNodesData;
            dataState.linksData = dataState.originalLinksData;
        }
        dataState.filteredNodes = dataState.nodesData;
        dataState.filteredLinks = dataState.linksData;
        visualizeGraph(dataState.filteredNodes, dataState.filteredLinks);
        break;
        case "toggleFixNodes":
        state.fixNodesOnDrag = checked;
        break;
    }
    updateActiveCounter();
    });
});

// Gestione della barra di ricerca (espandi/contrae)
bindEvent("search-icon", "click", function() {
    const searchInput = document.getElementById("searchInput");
    const isExpanded = searchInput.style.width === "200px";
    if (isExpanded) {
    searchInput.style.width = "0";
    searchInput.style.opacity = "0";
    } else {
    searchInput.style.width = "200px";
    searchInput.style.opacity = "1";
    searchInput.focus();
    }
    document.getElementById("search-container").classList.toggle("active");
});

// Binding degli slider per la simulazione
bindSlider("linkDistanceSlider", "link", "distance", DEFAULT_LINK_DISTANCE);
bindSlider("chargeStrengthSlider", "charge", "strength", DEFAULT_CHARGE_STRENGTH);
}

/**
 * Resetta tutti gli switch ai valori di default.
 */
function resetFormSwitches() {
state.showNodeLabels = true;
state.showLinkLabels = false;
state.groupingEnabled = false;
state.fixNodesOnDrag = false;
resetSwitch("toggleNodeLabels", true);
resetSwitch("toggleLinkLabels", false);
resetSwitch("toggleGrouping", false);
resetSwitch("toggleFixNodes", false);
updateActiveCounter();
}

/**
 * Reset dell'interfaccia e della simulazione.
 */
function resetUI() {
// Reset campo di ricerca
const searchInput = document.getElementById("searchInput");
searchInput.value = "";
searchInput.style.width = "0";
searchInput.style.opacity = "0";

// Nasconde pannello dei dettagli
document.getElementById("node-info").style.display = "none";

// Reset opzioni e slider
resetFormSwitches();
document.getElementById("linkDistanceSlider").value = DEFAULT_LINK_DISTANCE;
document.getElementById("chargeStrengthSlider").value = DEFAULT_CHARGE_STRENGTH;

// Ripristina dati originali e aggiorna grafo
dataState.nodesData = dataState.originalNodesData;
dataState.linksData = dataState.originalLinksData;
dataState.filteredNodes = dataState.nodesData;
dataState.filteredLinks = dataState.linksData;
visualizeGraph(dataState.filteredNodes, dataState.filteredLinks);

// Reset delle forze e dello zoom
dataState.filteredNodes.forEach(node => {
    node.fx = null;
    node.fy = null;
});
simulation
    .force("link", d3.forceLink(dataState.filteredLinks).id(d => d.id).distance(DEFAULT_LINK_DISTANCE))
    .force("charge", d3.forceManyBody().strength(DEFAULT_CHARGE_STRENGTH))
    .alpha(1)
    .restart();

d3.select("svg").transition().duration(750).call(
    d3.zoom().transform, d3.zoomIdentity
);
}

// ============================================
// 7. RESET DEL LAYOUT CON MODAL DI CONFERMA
// ============================================
document.addEventListener("DOMContentLoaded", () => {
initUI();
updateActiveCounter();

bindEvent("resetLayoutBtn", "click", () => {
    const modalElement = document.getElementById("confirmResetModal");
    const modalInstance = new bootstrap.Modal(modalElement);
    modalInstance.show();
});

bindEvent("confirmResetBtn", "click", () => {
    const modalElement = document.getElementById("confirmResetModal");
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    modalInstance.hide();
    resetUI();
});
});