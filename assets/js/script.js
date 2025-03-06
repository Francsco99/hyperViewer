// ============================================
// VARIABILI GLOBALI
// ============================================
let selectedNode = null;
let showNodeLabels = true;
let showLinkLabels = false;
let groupingEnabled = false;  // Raggruppamento disattivato di default

let nodesData = [];
let linksData = [];
let filteredNodes = [];
let filteredLinks = [];
let originalNodesData = [];  // Dati originali (non raggruppati)
let originalLinksData = [];
let simulation;

// ============================================
// FUNZIONI DI UTILITÀ
// ============================================
function resolvePath(base, href) {
    let baseParts = base.split("/").slice(0, -1);
    let hrefParts = href.split("/");
    let path = baseParts.concat(hrefParts).join("/");
    return path.replace(/\/\.\//g, "/").replace(/\/[^/]+\/\.\.\//g, "/");
}

// Funzione toggle generica (spostata in ambito globale)
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
// FUNZIONI DI RAGGRUPPAMENTO
// ============================================
function groupGraphData(nodes, links) {
    // Costruiamo una mappa dei gruppi basata sul "basepath"
    // Se un nodo è un anchor (id che inizia con "#") ed ha una proprietà baseFile,
    // allora il gruppo è rappresentato da baseFile.
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
                // Conserva tutti i nodi originali appartenenti a questo gruppo
                originalNodes: [node]
            };
        } else {
            groupedNodesObj[groupId].originalNodes.push(node);
        }
    });
    let groupedNodes = Object.values(groupedNodesObj);

    // Raggruppa i link: usa la mappa groupMapping per sostituire source e target
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
// FUNZIONI DI PROCESSING DEI DATI
// ============================================
async function processZip(zip) {
    let nodes = {};
    let links = [];

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
                    // href che rimanda ad una sezione della stessa pagina:
                    // Imposta anche la proprietà baseFile per poter raggruppare
                    let targetAnchor = href; // ad esempio "#info"
                    if (!nodes[targetAnchor]) {
                        nodes[targetAnchor] = { 
                            id: targetAnchor, 
                            label: targetAnchor, 
                            isAnchor: true,
                            baseFile: fileName  // memorizza il file di provenienza
                        };
                    } else {
                        nodes[targetAnchor].isAnchor = true;
                        if (!nodes[targetAnchor].baseFile) {
                            nodes[targetAnchor].baseFile = fileName;
                        }
                    }
                    links.push({ source: fileName, target: targetAnchor, label: text });
                } else {
                    // href relativo ad un'altra pagina o percorso
                    let targetFile = resolvePath(fileName, href);
                    if (!nodes[targetFile]) nodes[targetFile] = { id: targetFile, label: targetFile };
                    links.push({ source: fileName, target: targetFile, label: text });
                }
            });
        }
    }

    nodesData = Object.values(nodes);
    linksData = links;

    // Salva i dati originali per poter tornare alla visualizzazione non raggruppata
    originalNodesData = nodesData;
    originalLinksData = linksData;

    // Applica il raggruppamento se abilitato
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
// FUNZIONI DI VISUALIZZAZIONE DEL GRAFO
// ============================================
function visualizeGraph(nodes, links) {
    // Pulisce l'area SVG e imposta dimensioni
    const svg = d3.select("svg");
    svg.selectAll("*").remove();
    let width = document.getElementById("graph-container").clientWidth;
    let height = document.getElementById("graph-container").clientHeight;
    svg.attr("width", width).attr("height", height);

    // Crea un contenitore per l'intero grafo, utile per il panning e lo zoom
    let container = svg.append("g");

    // Abilita zoom e panning sull'elemento SVG
    svg.call(d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            container.attr("transform", event.transform);
        })
    );

    // Crea gruppi per link e nodi all'interno del container zoomabile
    let linkGroup = container.append("g").attr("class", "links");
    let nodeGroup = container.append("g").attr("class", "nodes");

    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2));

    // Crea gli archi
    let link = linkGroup.selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("class", "link");

    let linkText = linkGroup.selectAll("text")
        .data(links)
        .enter().append("text")
        .attr("class", "link-label")
        .attr("dy", -5)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(d => d.label)
        .style("display", showLinkLabels ? "block" : "none");

    // Crea i nodi senza definire inline il colore
    let node = nodeGroup.selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("class", d => {
            if (d.id === "web") return "node web";
            // Assegna la classe "anchor-node" se il nodo è un anchor, altrimenti "normal-node"
            return d.isAnchor ? "node anchor-node" : "node normal-node";
        })
        .attr("r", 10)
        .on("click", (event, d) => {
            event.stopPropagation();
            selectNode(d.id, link, node);
        })
        .on("mouseover", function(event, d) {
            d3.select("#tooltip")
                .style("left", event.pageX + 5 + "px")
                .style("top", event.pageY + 5 + "px")
                .style("display", "block")
                .html(`Nodo: ${d.label}`);
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

    // Tooltip sugli archi: se ci sono archi multipli tra gli stessi nodi, li mostra come lista
    link.on("mouseover", function(event, d) {
        // Filtra in linksData gli archi con lo stesso source e target
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
    svg.on("click", () => deselectNode(link, node));

    simulation.on("tick", () => {
        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        linkText.attr("x", d => (d.source.x + d.target.x) / 2)
            .attr("y", d => (d.source.y + d.target.y) / 2);

        node.attr("cx", d => d.x)
            .attr("cy", d => d.y);

        nodeText.attr("x", d => d.x)
                .attr("y", d => d.y);
    });
}

// ============================================
// FUNZIONI DI INTERAZIONE E DI DRAG
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
    d.fx = null;
    d.fy = null;
}

function selectNode(id, link, node) {
    selectedNode = id;
    // Evidenzia il nodo selezionato e i link relativi
    node.classed("selected", d => d.id === id);
    link.classed("highlighted", d => d.source.id === id);
    
    // Rimuove il grassetto da tutte le etichette dei nodi
    d3.selectAll(".node-label").classed("bold-label", false);
    
    // Applica il grassetto all'etichetta del nodo selezionato
    d3.selectAll(".node-label")
        .filter(d => d.id === id)
        .classed("bold-label", true);
    
    const nodeInfoContainer = document.getElementById("node-info");
    nodeInfoContainer.style.display = "block";
    
    // Se il nodo selezionato è raggruppato, recupera gli id originali
    let groupNode = nodesData.find(n => n.id === id && n.originalNodes);
    let sourceIds = groupNode ? groupNode.originalNodes.map(n => n.id) : [id];
    
    // Usa i dati originali per i link in uscita
    let outgoingLinks = originalLinksData.filter(linkObj => {
        let src = (typeof linkObj.source === "object") ? linkObj.source.id : linkObj.source;
        return sourceIds.includes(src);
    });
    
    // Costruisci il contenuto HTML della card usando Bootstrap
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
            // Aggiungiamo data attributes, una classe e lo stile del cursore
            contentHTML += `<li class="list-group-item link-item" data-source="${src}" data-target="${tgt}" style="cursor: pointer;">
                              <strong>${tgt}</strong> <br> <em>${linkObj.label}</em>
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
    
    // Listener per il pulsante di chiusura della card
    document.getElementById("close-node-info").addEventListener("click", () => {
        nodeInfoContainer.style.display = "none";
        // Rimuove l'evidenziazione dell'arco selezionato
        d3.selectAll(".link").classed("selected", false);
    });
    
    // Aggiunge listener agli elementi della lista per hover e click
    document.querySelectorAll(".link-item").forEach(item => {
        // Al passaggio del mouse, cambia lo sfondo per dare un feedback visivo
        item.addEventListener("mouseover", function() {
            // Applica un colore di background solo se non è già attivo
            if (!this.classList.contains("active")) {
                this.style.backgroundColor = "#f0f0f0";
            }
        });
        item.addEventListener("mouseout", function() {
            // Rimuove il colore di background se non è attivo
            if (!this.classList.contains("active")) {
                this.style.backgroundColor = "";
            }
        });
        // Al click, evidenzia l'elemento e l'arco corrispondente
        item.addEventListener("click", function() {
            // Rimuove lo stile "active" da tutti gli elementi della lista
            document.querySelectorAll(".link-item").forEach(li => {
                li.classList.remove("active");
                li.style.backgroundColor = "";
            });
            // Aggiunge la classe active e uno sfondo differente per indicare la selezione
            this.classList.add("active");
            this.style.backgroundColor = "#d0d0d0";
            
            // Rimuove l'evidenziazione da tutti gli archi e evidenzia quello selezionato
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
}

function deselectNode(link, node) {
    selectedNode = null;
    node.classed("selected", false);
    link.classed("highlighted", false);
    link.classed("selected",false);

    document.getElementById("node-info").style.display = "none";
    document.getElementById("node-name").innerHTML = '';
    document.getElementById("node-links").innerHTML = '';
}

// ============================================
// EVENT LISTENERS PER L'INTERAZIONE CON L'UTENTE
// ============================================
document.getElementById("fileInput").addEventListener("change", function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            JSZip.loadAsync(e.target.result).then(zip => processZip(zip));
        };
        reader.readAsArrayBuffer(file);
    }
});

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

document.getElementById("toggleGrouping").addEventListener("click", function() {
    groupingEnabled = !groupingEnabled;
    let button = document.getElementById("toggleGrouping");
    let isOn = button.getAttribute("data-state") === "on";
    if (isOn) {
         button.classList.remove("fa-toggle-on");
         button.classList.add("fa-toggle-off");
         button.setAttribute("data-state", "off");
    } else {
         button.classList.remove("fa-toggle-off");
         button.classList.add("fa-toggle-on");
         button.setAttribute("data-state", "on");
    }
    // Aggiorna i dati in base allo stato del raggruppamento
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
});

document.getElementById("toggleNodeLabels").addEventListener("click", function() {
    toggleButton("toggleNodeLabels", { value: showNodeLabels }, () => {
        showNodeLabels = !showNodeLabels;
        d3.selectAll(".node-label").style("display", showNodeLabels ? "block" : "none");
    });
});

document.getElementById("toggleLinkLabels").addEventListener("click", function() {
    toggleButton("toggleLinkLabels", { value: showLinkLabels }, () => {
        showLinkLabels = !showLinkLabels;
        d3.selectAll(".link-label").style("display", showLinkLabels ? "block" : "none");
    });
});

document.getElementById("search-icon").addEventListener("click", function() {
    const searchInput = document.getElementById("searchInput");
    const isExpanded = searchInput.style.width === "200px"; // Verifica se la barra di ricerca è espansa
    
    if (isExpanded) {
        // Nascondi la barra di ricerca
        searchInput.style.width = "0";
        searchInput.style.opacity = "0";
    } else {
        // Espandi la barra di ricerca
        searchInput.style.width = "200px";
        searchInput.style.opacity = "1";
        searchInput.focus(); // Aggiunge il focus al campo di ricerca
    }
});
