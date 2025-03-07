const graphContainer = document.getElementById('sample-graph');
const width = graphContainer.clientWidth;
const height = graphContainer.clientHeight;

// Creazione dell'SVG
const svg = d3.select("#sample-graph")
	.append("svg")
	.attr("width", width)
	.attr("height", height);


// Genera i nodi
const nodeCount = 50;
const nodes = d3.range(nodeCount).map(i => ({
	id: "Node " + (i + 1)
}));

// Genera link casuali tra i nodi (con probabilità 0.3 per ogni coppia)
const links = [];
for (let i = 0; i < nodeCount; i++) {
	for (let j = i + 1; j < nodeCount; j++) {
		if (Math.random() < 0.15) {
			links.push({
				source: nodes[i].id,
				target: nodes[j].id
			});
		}
	}
}

// Palette di colori pastello (saranno assegnati a rotazione)

const pastelColors = [
	"#3fa7d6",
	"#ee6352",
	"#59cd90",
	"#fac05e"
];

// Crea la simulazione con forze per il layout a rete (force-directed)
const simulation = d3.forceSimulation(nodes)
	.force("link", d3.forceLink(links).id(d => d.id).distance(500))
	// Abbassa la forza di repulsione per un movimento più lento
	.force("charge", d3.forceManyBody().strength(-100))
	.force("center", d3.forceCenter(width / 2, height / 2));

// Imposta un'energia bassa iniziale e disabilita il raffreddamento
simulation.alpha(0.1); // Imposta un'energia iniziale moderata
simulation.alphaDecay(0); // Disattiva la diminuzione automatica dell'alpha


// Disegna i collegamenti
const link = svg.append("g")
	.attr("stroke", "#9f9d9d")
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