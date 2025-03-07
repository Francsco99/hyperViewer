// ============================================
// 1. VARIABILI GLOBALI E COSTANTI
// ============================================
let selectedNode = null;
let showNodeLabels = true;       // Visualizza le etichette dei nodi
let showLinkLabels = false;      // Visualizza le etichette dei link
let groupingEnabled = false;     // Raggruppamento disattivato di default
let fixNodesOnDrag = false;

let nodesData = [];              // Dati dei nodi visualizzati (eventualmente raggruppati)
let linksData = [];              // Dati dei link visualizzati (eventualmente raggruppati)
let filteredNodes = [];          // Nodi filtrati (per ricerca)
let filteredLinks = [];          // Link filtrati (per ricerca)
let originalNodesData = [];      // Dati originali dei nodi (non raggruppati)
let originalLinksData = [];      // Dati originali dei link (non raggruppati)
let simulation;                  // Variabile per la simulazione D3

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
 * Funzione toggle per vecchie icone (opzionale, non usata con i form-switch di Bootstrap).
 */
function toggleButton(buttonId, stateVariable, updateFunction) {
    let button = document.getElementById(buttonId);
    let isOn = button.getAttribute("data-state") === "on";

    if (isOn) {
         button.classList.remove("fa-toggle-on");
         button.classList.add("fa-toggle-off");
         button.setAttribute("data-state", "off");
         stateVariable.value = false;
    } else {
         button.classList.remove("fa-toggle-off");
         button.classList.add("fa-toggle-on");
         button.setAttribute("data-state", "on");
         stateVariable.value = true;
    }
    if (updateFunction) updateFunction();
}

// ============================================
// 3. FUNZIONI DI RAGGRUPPAMENTO
// ============================================
/**
 * Raggruppa i nodi e i link basandosi sul "basepath".
 * Se un nodo è un anchor (id che inizia con "#") ed ha una proprietà baseFile, 
 * allora il gruppo è rappresentato da baseFile.
 */
function groupGraphData(nodes, links) {
    let groupMapping = {};
    let groupedNodesObj = {};

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
                originalNodes: [node] // Conserva tutti i nodi originali
            };
        } else {
            groupedNodesObj[groupId].originalNodes.push(node);
        }
    });

    let groupedNodes = Object.values(groupedNodesObj);
    let groupedLinksObj = {};

    links.forEach(link => {
        let src = (typeof link.source === "object") ? link.source.id : link.source;
        let tgt = (typeof link.target === "object") ? link.target.id : link.target;
        let groupSrc = groupMapping[src];
        let groupTgt = groupMapping[tgt];
        // Raggruppa solo se i gruppi sono differenti
        if (groupSrc !== groupTgt) {
            let key = groupSrc + "->" + groupTgt;
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

    let groupedLinks = Object.values(groupedLinksObj);
    return { nodes: groupedNodes, links: groupedLinks };
}

// ============================================
// 4. FUNZIONI DI ELABORAZIONE DEI DATI
// ============================================
/**
 * Processa il file ZIP contenente le pagine HTML e crea i dati per il grafo.
 */
async function processZip(zip) {
    let nodes = {};
    let links = [];

    // Cicla su tutti i file del ZIP
    for (const fileName of Object.keys(zip.files)) {
        if (fileName.endsWith(".html")) {
            let content = await zip.files[fileName].async("text");
            let parser = new DOMParser();
            let doc = parser.parseFromString(content, "text/html");

            // Crea il nodo per il file HTML
            nodes[fileName] = { id: fileName, label: fileName };

            // Processa tutti gli href presenti nella pagina
            doc.querySelectorAll("a[href]").forEach(link => {
                let href = link.getAttribute("href");
                let text = link.textContent.trim() || "link";

                if (href.startsWith("http")) {
                    nodes["web"] = { id: "web", label: "Web" };
                    links.push({ source: fileName, target: "web", label: text });
                } else if (href.charAt(0) === "#") {
                    // Per gli anchor interni, imposta baseFile per raggruppamento
                    let targetAnchor = href;
                    if (!nodes[targetAnchor]) {
                        nodes[targetAnchor] = { 
                            id: targetAnchor, 
                            label: targetAnchor, 
                            isAnchor: true,
                            baseFile: fileName
                        };
                    } else {
                        nodes[targetAnchor].isAnchor = true;
                        if (!nodes[targetAnchor].baseFile) {
                            nodes[targetAnchor].baseFile = fileName;
                        }
                    }
                    links.push({ source: fileName, target: targetAnchor, label: text });
                } else {
                    // Per href relativi
                    let targetFile = resolvePath(fileName, href);
                    if (!nodes[targetFile]) nodes[targetFile] = { id: targetFile, label: targetFile };
                    links.push({ source: fileName, target: targetFile, label: text });
                }
            });
        }
    }

    // Imposta i dati globali
    nodesData = Object.values(nodes);
    linksData = links;
    originalNodesData = nodesData;
    originalLinksData = linksData;

    // Se il raggruppamento è abilitato, aggiorna i dati
    if (groupingEnabled) {
        let grouped = groupGraphData(originalNodesData, originalLinksData);
        nodesData = grouped.nodes;
        linksData = grouped.links;
    }

    filteredNodes = nodesData;
    filteredLinks = linksData;
    visualizeGraph(filteredNodes, filteredLinks);
}

// ============================================
// 5. FUNZIONI DI VISUALIZZAZIONE DEL GRAFO
// ============================================
/**
 * Visualizza il grafo usando D3.
 */
function visualizeGraph(nodes, links) {
    // Seleziona l'elemento SVG e lo pulisce
    const svg = d3.select("svg");
    svg.selectAll("*").remove();
    let width = document.getElementById("graph-container").clientWidth;
    let height = document.getElementById("graph-container").clientHeight;
    svg.attr("width", width).attr("height", height);

    // Crea un container per il grafo, utile per zoom e panning
    let container = svg.append("g");

    // Abilita zoom e panning
    svg.call(d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            container.attr("transform", event.transform);
        })
    );

    // Crea gruppi per link e nodi
    let linkGroup = container.append("g").attr("class", "links");
    let nodeGroup = container.append("g").attr("class", "nodes");

    // Crea la simulazione con le forze
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(DEFAULT_LINK_DISTANCE))
        .force("charge", d3.forceManyBody().strength(DEFAULT_CHARGE_STRENGTH))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(width / 2).strength(0.05))
        .force("y", d3.forceY(height / 2).strength(0.05));

    // Crea i link (linee)
    let link = linkGroup.selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("class", "link");

    // Crea le etichette dei link
    let linkText = linkGroup.selectAll("text")
        .data(links)
        .enter().append("text")
        .attr("class", "link-label")
        .attr("dy", -5)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(d => d.label)
        .style("display", showLinkLabels ? "block" : "none");

    // Crea i nodi (cerchi) con classi diverse in base al tipo
    let nodeSelection = nodeGroup.selectAll("circle")
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
        .on("mouseover", function(event, d) {
            d3.select("#tooltip")
                .style("left", event.pageX + 5 + "px")
                .style("top", event.pageY + 5 + "px")
                .style("display", "block")
                .html(`Node: ${d.label}`);
        })
        .on("mouseout", function() {
            d3.select("#tooltip").style("display", "none");
        })
        .call(d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded));

    // Crea le etichette dei nodi
    let nodeText = nodeGroup.selectAll(".node-label")
        .data(nodes)
        .enter().append("text")
        .text(d => d.label)
        .attr("class", "node-label")
        .attr("dy", -15)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("display", showNodeLabels ? "block" : "none");

    // Gestione tooltip per i link
    link.on("mouseover", function(event, d) {
        let sameLinks = linksData.filter(linkObj => {
            let src = (typeof linkObj.source === "object") ? linkObj.source.id : linkObj.source;
            let tgt = (typeof linkObj.target === "object") ? linkObj.target.id : linkObj.target;
            return src === d.source.id && tgt === d.target.id;
        });
        let tooltipContent = `<strong>Link: ${d.source.id} → ${d.target.id}</strong>`;
        if(sameLinks.length > 1) {
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
    .on("mouseout", function() {
        d3.select("#tooltip").style("display", "none");
    });
    
    // Deseleziona nodo cliccando sullo sfondo
    svg.on("click", () => deselectNode(link, nodeSelection));

    // Aggiorna la simulazione ad ogni tick
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
// 6. GESTIONE DEGLI EVENTI DI DRAG & DROP
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
    if (!fixNodesOnDrag) {
        d.fx = null;
        d.fy = null;
    }
}

// ============================================
// 7. SELEZIONE NODO E CARD DI DETTAGLI
// ============================================
/**
 * Gestisce la selezione di un nodo, evidenziandolo e mostrando i dettagli in una card.
 */
function selectNode(id, link, node) {
    selectedNode = id;
    // Evidenzia il nodo selezionato e i link correlati
    node.classed("selected", d => d.id === id);
    link.classed("highlighted", d => d.source.id === id);

    // Aggiorna lo stile delle etichette dei nodi
    d3.selectAll(".node-label").classed("bold-label", false);
    d3.selectAll(".node-label")
      .filter(d => d.id === id)
      .classed("bold-label", true);

    // Mostra la card dei dettagli
    const nodeInfoContainer = document.getElementById("node-info");
    nodeInfoContainer.style.display = "block";

    // Se il nodo è raggruppato, recupera gli id originali
    let groupNode = nodesData.find(n => n.id === id && n.originalNodes);
    let sourceIds = groupNode ? groupNode.originalNodes.map(n => n.id) : [id];

    // Filtra i link in uscita basandosi sugli id originali
    let outgoingLinks = originalLinksData.filter(linkObj => {
        let src = (typeof linkObj.source === "object") ? linkObj.source.id : linkObj.source;
        return sourceIds.includes(src);
    });

    // Costruisce l'HTML della card dei dettagli
    let contentHTML = `
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Node Details</h5>
          <button id="close-node-info" type="button" class="btn-close" aria-label="Close"></button>
        </div>
        <div class="card-body">
          <p class="card-text"><strong>ID:</strong> ${id}</p>`;

    if (outgoingLinks.length > 0) {
        contentHTML += `
          <h6 class="mt-3">Outgoing links ➡️</h6>
          <div style="max-height: 60vh; overflow-y: auto;">
            <ul class="list-group list-group-flush">`;

        outgoingLinks.forEach(linkObj => {
            let src = (typeof linkObj.source === "object") ? linkObj.source.id : linkObj.source;
            let tgt = (typeof linkObj.target === "object") ? linkObj.target.id : linkObj.target;

            contentHTML += `
              <li class="list-group-item link-item d-flex justify-content-between align-items-center" data-source="${src}" data-target="${tgt}" style="cursor: pointer;">
                <div>
                  <strong>${tgt}</strong> <br> <em>${linkObj.label}</em>
                </div>
                <button class="btn btn-sm btn-primary follow-link-btn" data-target="${tgt}" style="margin-left: 8px;">
                  Select Target
                </button>
              </li>`;
        });

        contentHTML += `</ul>
          </div>`;
    } else {
        contentHTML += `<p class="mt-3">No outgoing links</p>`;
    }

    contentHTML += `
        </div>
      </div>`;

    nodeInfoContainer.innerHTML = contentHTML;

    // Listener per chiudere la card dei dettagli
    document.getElementById("close-node-info").addEventListener("click", () => {
        nodeInfoContainer.style.display = "none";
        deselectNode(link, node);
    });

    // Listener per la selezione dei link all'interno della card
    document.querySelectorAll(".link-item").forEach(item => {
        item.addEventListener("click", function() {
            document.querySelectorAll(".link-item").forEach(li => li.classList.remove("active"));
            this.classList.add("active");
            d3.selectAll(".link").classed("selected", false);
            const src = this.getAttribute("data-source");
            const tgt = this.getAttribute("data-target");
            link.filter(d => {
                let dSrc = (typeof d.source === "object") ? d.source.id : d.source;
                let dTgt = (typeof d.target === "object") ? d.target.id : d.target;
                return dSrc === src && dTgt === tgt;
            }).classed("selected", true);
        });
    });

    // Listener per il pulsante "Seleziona Target"
    document.querySelectorAll(".follow-link-btn").forEach(button => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const targetId = button.getAttribute("data-target");
            selectNode(targetId, link, node);
        });
    });
}

/**
 * Deseleziona il nodo e nasconde la card dei dettagli.
 */
function deselectNode(link, node) {
    selectedNode = null;
    node.classed("selected", false);
    link.classed("highlighted", false);
    link.classed("selected", false);
    document.getElementById("node-info").style.display = "none";
    if(document.getElementById("node-name")) document.getElementById("node-name").innerHTML = '';
    if(document.getElementById("node-links")) document.getElementById("node-links").innerHTML = '';
}

// ============================================
// 8. FUNZIONI DI SUPPORTO PER L'INTERFACCIA UTENTE
// ============================================
/**
 * Aggiorna il badge counter in base al numero di form-switch attivi.
 */
function updateActiveCounter() {
    let count = 0;
    if (document.getElementById("toggleNodeLabels").checked) count++;
    if (document.getElementById("toggleLinkLabels").checked) count++;
    if (document.getElementById("toggleGrouping").checked) count++;
    document.getElementById("activeCounterBadge").innerText = count;
}

/**
 * Resetta i form-switch ai valori originali.
 */
function resetFormSwitches() {
    showNodeLabels = true;
    showLinkLabels = false;
    groupingEnabled = false;
    document.getElementById("toggleNodeLabels").checked = true;
    document.getElementById("toggleLinkLabels").checked = false;
    document.getElementById("toggleGrouping").checked = false;
    updateActiveCounter();
}

// ============================================
// 9. SETUP DEGLI EVENT LISTENERS
// ============================================

// Gestione del caricamento del file ZIP
document.getElementById("fileInput").addEventListener("change", function(event) {
    resetFormSwitches();
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            JSZip.loadAsync(e.target.result).then(zip => processZip(zip));
        };
        reader.readAsArrayBuffer(file);
    }
});

// Gestione della ricerca (filtraggio dei nodi)
document.getElementById("searchInput").addEventListener("input", function(event) {
    let searchText = event.target.value.toLowerCase();
    if (searchText === "") {
        filteredNodes = nodesData;
        filteredLinks = linksData;
    } else {
        let searchedNode = nodesData.find(node => node.label.toLowerCase().includes(searchText));
        if (searchedNode) {
            let visibleNodes = new Set();
            visibleNodes.add(searchedNode.id);
            linksData.forEach(link => {
                if (link.source.id === searchedNode.id) visibleNodes.add(link.target.id);
                if (link.target.id === searchedNode.id) visibleNodes.add(link.source.id);
            });
            filteredNodes = nodesData.filter(node => visibleNodes.has(node.id));
            filteredLinks = linksData.filter(link => visibleNodes.has(link.source.id) && visibleNodes.has(link.target.id));
        } else {
            filteredNodes = [];
            filteredLinks = [];
        }
    }
    visualizeGraph(filteredNodes, filteredLinks);
});

// Gestione dei form-switch per Display Options
document.getElementById("toggleNodeLabels").addEventListener("change", function() {
    showNodeLabels = this.checked;
    d3.selectAll(".node-label").style("display", showNodeLabels ? "block" : "none");
    updateActiveCounter();
});

document.getElementById("toggleLinkLabels").addEventListener("change", function() {
    showLinkLabels = this.checked;
    d3.selectAll(".link-label").style("display", showLinkLabels ? "block" : "none");
    updateActiveCounter();
});

document.getElementById("toggleGrouping").addEventListener("change", function() {
    groupingEnabled = this.checked;
    if (groupingEnabled) {
         let grouped = groupGraphData(originalNodesData, originalLinksData);
         nodesData = grouped.nodes;
         linksData = grouped.links;
    } else {
         nodesData = originalNodesData;
         linksData = originalLinksData;
    }
    filteredNodes = nodesData;
    filteredLinks = linksData;
    visualizeGraph(filteredNodes, filteredLinks);
    updateActiveCounter();
});

// Gestione della barra di ricerca (espandi/contrae)
document.getElementById("search-icon").addEventListener("click", function() {
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
});

// Gestione degli slider per la simulazione
document.getElementById("linkDistanceSlider").addEventListener("input", function() {
    const newDistance = +this.value;
    if (simulation && simulation.force("link")) {
        simulation.force("link").distance(newDistance);
        simulation.alpha(1).restart();
    }
});

document.getElementById("chargeStrengthSlider").addEventListener("input", function() {
    const newCharge = +this.value;
    if (simulation && simulation.force("charge")) {
        simulation.force("charge").strength(newCharge);
        simulation.alpha(1).restart();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function(tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});

document.getElementById("search-icon").addEventListener("click", function() {
    var container = document.getElementById("search-container");
    container.classList.toggle("active");
});

document.getElementById("toggleFixNodes").addEventListener("change", function() {
    fixNodesOnDrag = this.checked;
});

// ============================================
// 10. RESET DEL LAYOUT
// ============================================
document.getElementById("resetLayoutBtn").addEventListener("click", function() {
    let modal = new bootstrap.Modal(document.getElementById('confirmResetModal'));
    modal.show();
});

document.getElementById("confirmResetBtn").addEventListener("click", function() {
    let modalEl = document.getElementById('confirmResetModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();

    filteredNodes.forEach(node => {
        node.fx = null;
        node.fy = null;
    });
    document.getElementById("linkDistanceSlider").value = DEFAULT_LINK_DISTANCE;
    document.getElementById("chargeStrengthSlider").value = DEFAULT_CHARGE_STRENGTH;
    simulation
        .force("link", d3.forceLink(filteredLinks).id(d => d.id)
            .distance(DEFAULT_LINK_DISTANCE))
        .force("charge", d3.forceManyBody().strength(DEFAULT_CHARGE_STRENGTH))
        .alpha(1)
        .restart();
});
