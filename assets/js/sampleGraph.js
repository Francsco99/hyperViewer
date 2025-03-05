// Gestione animazione al clic su Get Started
document.getElementById("getStartedBtn").addEventListener("click", function(e) {
    e.preventDefault();
    // Nascondi gradualmente l'hero
    document.getElementById("hero-container").classList.add("hide-hero");
    // Espandi il contenitore del grafo
    document.getElementById("graph-container").classList.add("expand-graph");
    // Dopo l'animazione (1s), reindirizza a graph.html
    setTimeout(function() {
      window.location.href = "graph.html";
    }, 1000);
  });
  
  // Gestione offcanvas per le istruzioni
  const infoBtn = document.getElementById("infoBtn");
  const offcanvas = document.getElementById("infoOffcanvas");
  const closeOffcanvas = document.getElementById("closeOffcanvas");
  
  infoBtn.addEventListener("click", function() {
    offcanvas.classList.add("active");
  });
  
  closeOffcanvas.addEventListener("click", function() {
    offcanvas.classList.remove("active");
  });
const graphContainer = document.getElementById('sample-graph');
const width = graphContainer.clientWidth;
const height = graphContainer.clientHeight;

// Crea l'SVG
const svg = d3.select("#sample-graph")
                .append("svg")
                .attr("width", width)
                .attr("height", height);

// Genera 15 nodi
const nodeCount = 15;
const nodes = d3.range(nodeCount).map(i => ({ id: "Node " + (i + 1) }));

// Genera link casuali tra i nodi (con probabilità 0.3 per ogni coppia)
const links = [];
for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
    if (Math.random() < 0.3) {
        links.push({ source: nodes[i].id, target: nodes[j].id });
    }
    }
}

// Palette di colori pastello (saranno assegnati a rotazione)
const pastelColors = [
    "#ffb3ba", // rosa pastello
    "#ffdfba", // arancione pastello
    "#ffffba", // giallo pastello
    "#baffc9", // verde pastello
    "#bae1ff", // azzurro pastello
    "#c9c9ff", // lilla pastello
    "#ffccf9", // rosa sfumato
    "#ccf9ff", // celeste
    "#f9ffcc", // verde chiaro
    "#ccfffb"  // turchese chiaro
];

// Crea la simulazione con forze per il layout a rete (force-directed)
const simulation = d3.forceSimulation(nodes)
                        .force("link", d3.forceLink(links).id(d => d.id).distance(100))
                        .force("charge", d3.forceManyBody().strength(-300))
                        .force("center", d3.forceCenter(width / 2, height / 2));

// Disegna i collegamenti
const link = svg.append("g")
                .attr("stroke", "#999")
                .attr("stroke-opacity", 0.6)
                .selectAll("line")
                .data(links)
                .enter().append("line")
                .attr("stroke-width", 2);

// Disegna i nodi con colori pastello (usando lo stesso ordine della lista)
const node = svg.append("g")
                .attr("stroke", "#fff")
                .attr("stroke-width", 1.5)
                .selectAll("circle")
                .data(nodes)
                .enter().append("circle")
                .attr("r", 10)
                .attr("fill", (d, i) => pastelColors[i % pastelColors.length])
                .call(d3.drag()
                        .on("start", dragstarted)
                        .on("drag", dragged)
                        .on("end", dragended));

// Aggiunge un tooltip (title) ad ogni nodo
node.append("title")
    .text(d => d.id);

// Aggiorna la posizione dei nodi e dei collegamenti ad ogni tick della simulazione
simulation.on("tick", () => {
    link.attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    node.attr("cx", d => d.x)
        .attr("cy", d => d.y);
});

// Funzioni per il drag dei nodi
function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}