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
    // Mappa ogni nodo al suo gruppo: parte prima di '#' (oppure l'intero id se non presente)
    let groupMapping = {};
    nodes.forEach(node => {
        let groupId = node.id.split("#")[0];
        groupMapping[node.id] = groupId;
    });

    // Crea i nodi raggruppati (un solo nodo per gruppo)
    let groupedNodesObj = {};
    nodes.forEach(node => {
        let groupId = groupMapping[node.id];
        if (!groupedNodesObj[groupId]) {
            groupedNodesObj[groupId] = { id: groupId, label: groupId };
        }
    });
    let groupedNodes = Object.values(groupedNodesObj);

    // Crea i link raggruppati sostituendo source e target con i rispettivi gruppi.
    // Scarta i self-loop (link all'interno dello stesso gruppo)
    let groupedLinksObj = {};
    links.forEach(link => {
        let src = (typeof link.source === "object") ? link.source.id : link.source;
        let tgt = (typeof link.target === "object") ? link.target.id : link.target;
        let groupSrc = groupMapping[src];
        let groupTgt = groupMapping[tgt];
        if (groupSrc !== groupTgt) {
            let key = groupSrc + "->" + groupTgt;
            if (!groupedLinksObj[key]) {
                groupedLinksObj[key] = { source: groupSrc, target: groupTgt, label: "" };
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

            nodes[fileName] = { id: fileName, label: fileName };

            doc.querySelectorAll("a[href]").forEach(link => {
                let href = link.getAttribute("href");
                let text = link.textContent.trim() || "link";

                if (href.startsWith("http")) {
                    nodes["web"] = { id: "web", label: "Web" };
                    links.push({ source: fileName, target: "web", label: text });
                } else {
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

    // Crea i nodi
    let node = nodeGroup.selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("class", d => d.id === "web" ? "node web" : "node")
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

    // Tooltip sugli archi
    link.on("mouseover", function(event, d) {
        d3.select("#tooltip")
            .style("left", event.pageX + 5 + "px")
            .style("top", event.pageY + 5 + "px")
            .style("display", "block")
            .html(`Link: ${d.source.id} -> ${d.target.id}`);
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
    node.classed("selected", d => d.id === id);
    link.classed("highlighted", d => d.source.id === id);

    document.getElementById("node-info").style.display = "block";
    document.getElementById("node-name").innerHTML = `<strong>${id}</strong>`;

    const nodeLinks = document.getElementById("node-links");
    nodeLinks.innerHTML = '';

    linksData.forEach(link => {
        if (link.source.id === id) {
            const listItem = document.createElement("li");
            listItem.textContent = `${link.source.id} -> ${link.target.id}`;
            nodeLinks.appendChild(listItem);
        }
    });
}

function deselectNode(link, node) {
    selectedNode = null;
    node.classed("selected", false);
    link.classed("highlighted", false);

    document.getElementById("node-info").style.display = "none";
    document.getElementById("node-name").innerHTML = '';
    document.getElementById("node-links").innerHTML = '';
}

// ============================================
// EVENT LISTENERS PER L'INTERAZIONE CON L'UTENTE
// ============================================

// Upload del file ZIP
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

// Ricerca (filtra i nodi in base al testo)
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

// Toggle per il raggruppamento dei nodi
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

// REGISTRAZIONE DEI TOGGLE PER LE ETICHETTE (UNA SOLA VOLTA)
// Toggle etichette nodi
document.getElementById("toggleNodeLabels").addEventListener("click", function() {
    toggleButton("toggleNodeLabels", { value: showNodeLabels }, () => {
        showNodeLabels = !showNodeLabels;
        d3.selectAll(".node-label").style("display", showNodeLabels ? "block" : "none");
    });
});

// Toggle etichette archi
document.getElementById("toggleLinkLabels").addEventListener("click", function() {
    toggleButton("toggleLinkLabels", { value: showLinkLabels }, () => {
        showLinkLabels = !showLinkLabels;
        d3.selectAll(".link-label").style("display", showLinkLabels ? "block" : "none");
    });
});
