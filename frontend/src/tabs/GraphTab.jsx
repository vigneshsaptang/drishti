import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { buildGraph } from '../lib/api';
import { EDGE_TYPES, NIA_LINKAGES } from '../lib/ontology';

const NODE_COLORS = {
  phone: '#3b82f6', email: '#10b981', breach: '#f59e0b', darkweb_account: '#a855f7',
  telegram_group: '#06b6d4', upi: '#eab308', person: '#f8fafc', url: '#64748b',
  bank: '#d97706', crypto: '#f97316', watchlist: '#dc2626', drug: '#ef4444',
};

const NODE_RADIUS = { phone: 14, email: 12, breach: 10, default: 10 };

export default function GraphTab({ data, onPivot }) {
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState(null);
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!data) return;
    buildGraph(data)
      .then(g => setGraph(g))
      .catch(e => setError(e.message));
  }, [data]);

  useEffect(() => {
    if (!graph?.nodes?.length || !svgRef.current || !containerRef.current) return;
    renderD3Graph(svgRef.current, containerRef.current, graph, onPivot);
  }, [graph, onPivot]);

  if (error) return <p className="text-entity-drug text-sm py-8 text-center font-mono">Graph error: {error}</p>;
  if (!graph) return <p className="text-sap-dim text-sm py-8 text-center font-mono animate-scan">Building connection graph...</p>;
  if (!graph.nodes?.length) return <p className="text-sap-dim text-sm py-8 text-center font-mono">No connections to visualize</p>;

  return (
    <div className="bg-sap-surface border border-sap-border rounded-lg p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-mono tracking-[3px] uppercase text-sap-accent">Connection Graph</h3>
        <div className="flex gap-3 text-[10px] font-mono text-sap-dim">
          <span>{graph.nodes.length} nodes</span>
          <span>{graph.edges.length} edges</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-[10px] font-mono text-sap-dim">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            {type.replace('_', ' ')}
          </div>
        ))}
      </div>

      <div ref={containerRef} className="w-full h-[550px] bg-sap-bg rounded border border-sap-border relative overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  );
}

function renderD3Graph(svgEl, containerEl, graph, onPivot) {
  const width = containerEl.offsetWidth;
  const height = containerEl.offsetHeight || 550;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', [0, 0, width, height]);

  // Prepare data (D3 mutates these)
  const nodes = graph.nodes.map(n => ({ ...n }));
  const links = graph.edges.map(e => ({ ...e }));

  // Force simulation
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => (NODE_RADIUS[d.type] || NODE_RADIUS.default) + 4))
    .force('x', d3.forceX(width / 2).strength(0.05))
    .force('y', d3.forceY(height / 2).strength(0.05));

  // Zoom
  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', (event) => {
    g.attr('transform', event.transform);
  }));

  // Links with ontology edge styling
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', d => {
      const et = EDGE_TYPES[d.type];
      return et?.color || '#1e2d45';
    })
    .attr('stroke-width', d => {
      const et = EDGE_TYPES[d.type];
      return et?.weight || 1.5;
    })
    .attr('stroke-dasharray', d => {
      const et = EDGE_TYPES[d.type];
      if (et?.style === 'dashed') return '6 3';
      if (et?.style === 'dotted') return '2 2';
      return null;
    })
    .attr('stroke-opacity', 0.5);

  // Link labels
  const linkLabel = g.append('g')
    .selectAll('text')
    .data(links)
    .join('text')
    .text(d => d.type)
    .attr('fill', '#3d5278')
    .attr('font-size', 7)
    .attr('font-family', 'monospace')
    .attr('text-anchor', 'middle')
    .attr('dy', -3);

  // Node groups
  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .call(d3.drag()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  // Node circles
  node.append('circle')
    .attr('r', d => NODE_RADIUS[d.type] || NODE_RADIUS.default)
    .attr('fill', d => NODE_COLORS[d.type] || '#64748b')
    .attr('stroke', d => NODE_COLORS[d.type] || '#64748b')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.3)
    .attr('cursor', 'pointer')
    .on('click', (event, d) => {
      if (onPivot && (d.type === 'phone' || d.type === 'email')) {
        onPivot(d.type, d.label);
      }
    })
    .on('mouseover', function() { d3.select(this).attr('stroke-opacity', 0.8).attr('stroke-width', 3); })
    .on('mouseout', function() { d3.select(this).attr('stroke-opacity', 0.3).attr('stroke-width', 2); });

  // Node labels
  node.append('text')
    .text(d => d.label.length > 22 ? d.label.slice(0, 20) + '...' : d.label)
    .attr('fill', '#6b7fa3')
    .attr('font-size', 9)
    .attr('font-family', 'monospace')
    .attr('text-anchor', 'middle')
    .attr('dy', d => (NODE_RADIUS[d.type] || NODE_RADIUS.default) + 12)
    .attr('pointer-events', 'none');

  // Type badge
  node.append('text')
    .text(d => d.type.charAt(0).toUpperCase())
    .attr('fill', '#060a13')
    .attr('font-size', 8)
    .attr('font-weight', 'bold')
    .attr('font-family', 'monospace')
    .attr('text-anchor', 'middle')
    .attr('dy', 3)
    .attr('pointer-events', 'none');

  // Tooltip
  node.append('title').text(d => `${d.type}: ${d.label}`);

  // Tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    linkLabel
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2);

    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}
