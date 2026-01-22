"use client";

/**
 * Admin Chatbot Workflow Editor
 *
 * - Uses React Flow for visual editing
 * - Loads/saves workflow JSON (jsonb) via Hasura GraphQL (graphql-request)
 * - Manual Save (no autosave)
 *
 * Notes:
 * - No API routes
 * - No authentication
 * - Node text editing is intentionally skipped for simplicity
 */

import { useParams } from "next/navigation";


import Link from "next/link";
import { gql } from "graphql-request";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
	addEdge,
	Background,
	Controls,
	Handle,
	MiniMap,
	useEdgesState,
	useNodesState,
	updateEdge,
	Connection,
	Edge,
	EdgeChange,
	MarkerType,
	Node,
	NodeChange,
	NodeProps,
	OnEdgeUpdateFunc,
	Position,
} from "reactflow";

import { hasuraClient } from "../../../../../lib/hasura";

type WorkflowJson = {
	nodes: Array<{
		id: string;
		userMessage: string;
		botReply: string;
		options: Array<{ nextNodeId: string }>;
		position: { x: number; y: number };
	}>;
};

type WorkflowRow = {
	id: string;
	chatbot_id: string;
	flow_json: WorkflowJson | null;
};

type FlowNodeData = {
	userMessage: string;
	botReply: string;
};

function WorkflowNode({ data, selected }: NodeProps<FlowNodeData>) {
	return (
		<div
			style={{
				padding: 10,
				borderRadius: 12,
				border: selected ? "2px solid #2563eb" : "1px solid #d1d5db",
				background: "white",
				minWidth: 220,
				boxShadow: selected ? "0 8px 24px rgba(37, 99, 235, 0.15)" : "0 1px 3px rgba(0,0,0,0.08)",
			}}
		>
			<Handle type="target" position={Position.Top} />
			<div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
				User
			</div>
			<div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginTop: 4, whiteSpace: "pre-wrap" }}>
				{data.userMessage || "(empty)"}
			</div>
			<div style={{ height: 10 }} />
			<div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
				Bot
			</div>
			<div style={{ fontSize: 13, color: "#374151", marginTop: 4, whiteSpace: "pre-wrap" }}>
				{data.botReply || "(empty)"}
			</div>
			<Handle type="source" position={Position.Bottom} />
		</div>
	);
}

const GET_WORKFLOW_QUERY = gql`
	query GetWorkflow($chatbotId: uuid!) {
		chatbots_workflows(where: { chatbot_id: { _eq: $chatbotId } }, limit: 1) {
			id
			chatbot_id
			flow_json
		}
	}
`;

const UPDATE_WORKFLOW_MUTATION = gql`
	mutation UpdateWorkflow($chatbotId: uuid!, $flowJson: jsonb!) {
		update_chatbots_workflows(where: { chatbot_id: { _eq: $chatbotId } }, _set: { flow_json: $flowJson }) {
			affected_rows
		}
	}
`;

const INSERT_WORKFLOW_MUTATION = gql`
	mutation InsertWorkflow($chatbotId: uuid!, $flowJson: jsonb!) {
		insert_chatbots_workflows_one(object: { chatbot_id: $chatbotId, flow_json: $flowJson }) {
			id
		}
	}
`;

function makeNodeId(): string {
	const random = globalThis.crypto?.randomUUID?.();
	return random ? `node-${random}` : `node-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function workflowJsonToFlow(workflowJson: WorkflowJson | null): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
	if (!workflowJson?.nodes?.length) {
		return { nodes: [], edges: [] };
	}

	const nodes: Node<FlowNodeData>[] = workflowJson.nodes.map((n) => ({
		id: n.id,
		type: "workflowNode",
		position: n.position ?? { x: 0, y: 0 },
		data: {
			userMessage: n.userMessage ?? "",
			botReply: n.botReply ?? "",
		},
	}));

	const edges: Edge[] = [];
	for (const node of workflowJson.nodes) {
		const opts = Array.isArray(node.options) ? node.options : [];
		opts.forEach((opt, index) => {
			if (!opt?.nextNodeId) return;
			edges.push({
				id: `e-${node.id}-${opt.nextNodeId}-${index}`,
				source: node.id,
				target: opt.nextNodeId,
				type: "smoothstep",
				markerEnd: { type: MarkerType.ArrowClosed },
			});
		});
	}

	return { nodes, edges };
}

function flowToWorkflowJson(nodes: Node<FlowNodeData>[], edges: Edge[]): WorkflowJson {
	const outgoingBySource = new Map<string, string[]>();
	for (const edge of edges) {
		if (!edge.source || !edge.target) continue;
		const list = outgoingBySource.get(edge.source) ?? [];
		list.push(edge.target);
		outgoingBySource.set(edge.source, list);
	}

	return {
		nodes: nodes.map((node) => ({
			id: node.id,
			userMessage: node.data?.userMessage ?? "",
			botReply: node.data?.botReply ?? "",
			options: (outgoingBySource.get(node.id) ?? []).map((nextNodeId) => ({ nextNodeId })),
			position: {
				x: node.position?.x ?? 0,
				y: node.position?.y ?? 0,
			},
		})),
	};
}

// export default function AdminChatbotWorkflowPage({
// 	params,
// }: {
// 	params: { chatbotId: string };
// }) {
// 	const chatbotId = params.chatbotId;

export default function AdminChatbotWorkflowPage() {
	const params = useParams();
	const chatbotId = params.chatbotId as string;


	const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);

	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
	const [isDirty, setIsDirty] = useState(false);

	const didInitialLoadRef = useRef(false);

	const nodeTypes = useMemo(
		() => ({
			workflowNode: WorkflowNode,
		}),
		[]
	);

	const selectedNode = useMemo(() => {
		if (!selectedNodeId) return null;
		return nodes.find((n) => n.id === selectedNodeId) ?? null;
	}, [nodes, selectedNodeId]);

	const selectedEdge = useMemo(() => {
		if (!selectedEdgeId) return null;
		return edges.find((e) => e.id === selectedEdgeId) ?? null;
	}, [edges, selectedEdgeId]);

	const updateSelectedNodeData = useCallback(
		(patch: Partial<FlowNodeData>) => {
			if (!selectedNodeId) return;
			setNodes((nds) =>
				nds.map((n) => {
					if (n.id !== selectedNodeId) return n;
					return {
						...n,
						data: {
							...(n.data ?? { userMessage: "", botReply: "" }),
							...patch,
						},
					};
				})
			);
			if (didInitialLoadRef.current) setIsDirty(true);
		},
		[selectedNodeId, setNodes]
	);

	const onConnect = useCallback(
		(connection: Connection) => {
			setEdges((eds) => addEdge({ ...connection, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }, eds));
			setIsDirty(true);
		},
		[setEdges]
	);

	const onEdgeUpdate: OnEdgeUpdateFunc = useCallback(
		(oldEdge, newConnection) => {
			setEdges((eds) => updateEdge(oldEdge, newConnection, eds));
			setIsDirty(true);
		},
		[setEdges]
	);

	const handleNodesChange = useCallback(
		(changes: NodeChange[]) => {
			onNodesChange(changes);
			if (didInitialLoadRef.current) setIsDirty(true);
		},
		[onNodesChange]
	);

	const handleEdgesChange = useCallback(
		(changes: EdgeChange[]) => {
			onEdgesChange(changes);
			if (didInitialLoadRef.current) setIsDirty(true);
		},
		[onEdgesChange]
	);

	useEffect(() => {
		let isCancelled = false;

		async function load() {
			setIsLoading(true);
			setError(null);

			try {
				const data = await hasuraClient.request<{ chatbots_workflows: WorkflowRow[] }>(GET_WORKFLOW_QUERY, {
					chatbotId,
				});

				const row = data.chatbots_workflows?.[0] ?? null;
				const flowJson = row?.flow_json ?? null;
				const { nodes: loadedNodes, edges: loadedEdges } = workflowJsonToFlow(flowJson);

				if (isCancelled) return;
				setNodes(loadedNodes);
				setEdges(loadedEdges);
				didInitialLoadRef.current = true;
				setIsDirty(false);
			} catch (e) {
				if (isCancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (!isCancelled) setIsLoading(false);
			}
		}

		if (!chatbotId) {
			setIsLoading(false);
			setError("Chatbot id is missing in route params");
			return () => {
				isCancelled = true;
			};
		}

		load();
		return () => {
			isCancelled = true;
		};
	}, [chatbotId, setEdges, setNodes]);

	const addNode = useCallback(() => {
		const newId = makeNodeId();
		const base = 80 + nodes.length * 30;
		setNodes((nds) => [
			...nds,
			{
				id: newId,
				type: "workflowNode",
				position: { x: base, y: base },
				data: {
					userMessage: "User message",
					botReply: "Bot reply",
				},
			},
		]);
		setSelectedNodeId(newId);
		setIsDirty(true);
	}, [nodes.length, setNodes]);

	const deleteSelectedNode = useCallback(() => {
		if (!selectedNodeId) return;
		setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
		setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
		setSelectedNodeId(null);
		setIsDirty(true);
	}, [selectedNodeId, setEdges, setNodes]);

	const deleteSelectedEdge = useCallback(() => {
		if (!selectedEdgeId) return;
		setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
		setSelectedEdgeId(null);
		setIsDirty(true);
	}, [selectedEdgeId, setEdges]);

	useEffect(() => {
		function isTypingTarget(target: EventTarget | null): boolean {
			if (!target || !(target instanceof HTMLElement)) return false;
			const tag = target.tagName;
			return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
		}

		function onKeyDown(e: KeyboardEvent) {
			if (isTypingTarget(e.target)) return;
			if (e.key !== "Delete" && e.key !== "Backspace") return;
			if (!selectedEdgeId) return;
			e.preventDefault();
			deleteSelectedEdge();
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [deleteSelectedEdge, selectedEdgeId]);

	const saveWorkflow = useCallback(async () => {
		setIsSaving(true);
		setError(null);
		try {
			const flowJson = flowToWorkflowJson(nodes, edges);

			const updated = await hasuraClient.request<{ update_chatbots_workflows: { affected_rows: number } }>(
				UPDATE_WORKFLOW_MUTATION,
				{ chatbotId, flowJson }
			);

			if ((updated.update_chatbots_workflows?.affected_rows ?? 0) === 0) {
				await hasuraClient.request(INSERT_WORKFLOW_MUTATION, { chatbotId, flowJson });
			}

			setIsDirty(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setIsSaving(false);
		}
	}, [chatbotId, edges, nodes]);

	const defaultEdgeOptions = useMemo(
		() => ({
			type: "smoothstep" as const,
			markerEnd: { type: MarkerType.ArrowClosed },
		}),
		[]
	);

	return (
		<main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
				<div>
					<div style={{ marginBottom: 8 }}>
						<Link href="/admin/chatbots" style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}>
							← Back to Chatbots
						</Link>
					</div>
					<h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Admin · Workflow</h1>
					<p style={{ margin: "6px 0 0", color: "#6b7280" }}>Chatbot id: {chatbotId}</p>
				</div>

				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
					<button
						type="button"
						onClick={addNode}
						disabled={isLoading}
						style={{
							background: "#111827",
							color: "white",
							border: 0,
							borderRadius: 10,
							padding: "10px 12px",
							cursor: isLoading ? "not-allowed" : "pointer",
						}}
					>
						+ Add node
					</button>

					<button
						type="button"
						onClick={deleteSelectedNode}
						disabled={!selectedNodeId || isLoading}
						style={{
							background: !selectedNodeId || isLoading ? "#f3f4f6" : "#fee2e2",
							color: !selectedNodeId || isLoading ? "#6b7280" : "#991b1b",
							border: "1px solid #e5e7eb",
							borderRadius: 10,
							padding: "10px 12px",
							cursor: !selectedNodeId || isLoading ? "not-allowed" : "pointer",
						}}
					>
						Delete node
					</button>

					<button
						type="button"
						onClick={deleteSelectedEdge}
						disabled={!selectedEdgeId || isLoading}
						style={{
							background: !selectedEdgeId || isLoading ? "#f3f4f6" : "#fee2e2",
							color: !selectedEdgeId || isLoading ? "#6b7280" : "#991b1b",
							border: "1px solid #e5e7eb",
							borderRadius: 10,
							padding: "10px 12px",
							cursor: !selectedEdgeId || isLoading ? "not-allowed" : "pointer",
						}}
					>
						Delete edge
					</button>

					<button
						type="button"
						onClick={saveWorkflow}
						disabled={isLoading || isSaving || !isDirty}
						style={{
							background: isLoading || isSaving || !isDirty ? "#9ca3af" : "#2563eb",
							color: "white",
							border: 0,
							borderRadius: 10,
							padding: "10px 12px",
							cursor: isLoading || isSaving || !isDirty ? "not-allowed" : "pointer",
						}}
					>
						{isSaving ? "Saving…" : "Save"}
					</button>
				</div>
			</div>

			{error ? (
				<div style={{ marginBottom: 12, padding: 12, border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 12, color: "#991b1b" }}>
					<strong>Error:</strong> {error}
				</div>
			) : null}

			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
				<div style={{ color: "#6b7280", fontSize: 14 }}>
					{isLoading ? "Loading workflow…" : isDirty ? "Unsaved changes" : "All changes saved"}
				</div>
				<div style={{ color: "#6b7280", fontSize: 14 }}>
					Nodes: {nodes.length} · Edges: {edges.length}
				</div>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 12, alignItems: "start" }}>
				<div style={{ height: 640, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
					<ReactFlow
						nodes={nodes}
						edges={edges}
						nodeTypes={nodeTypes}
						onNodesChange={handleNodesChange}
						onEdgesChange={handleEdgesChange}
						onConnect={onConnect}
						onEdgeUpdate={onEdgeUpdate}
						defaultEdgeOptions={defaultEdgeOptions}
						onSelectionChange={(selection) => {
							const nodeId = selection.nodes?.[0]?.id ?? null;
							const edgeId = selection.edges?.[0]?.id ?? null;
							setSelectedNodeId(nodeId);
							setSelectedEdgeId(edgeId);
						}}
						fitView
					>
						<Background gap={16} color="#e5e7eb" />
						<Controls />
						<MiniMap pannable zoomable nodeColor={(n) => (n.id === selectedNodeId ? "#2563eb" : "#9ca3af")} />
					</ReactFlow>
				</div>

				<aside style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "white" }}>
					<div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10, color: "#111827" }}>Editor</div>

					{selectedNode ? (
						<div style={{ display: "grid", gap: 10 }}>
							<div style={{ color: "#6b7280", fontSize: 12 }}>Selected node: {selectedNode.id}</div>

							<label style={{ display: "grid", gap: 6 }}>
								<span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>User message</span>
								<textarea
									value={selectedNode.data?.userMessage ?? ""}
									onChange={(e) => updateSelectedNodeData({ userMessage: e.target.value })}
									rows={4}
									style={{
										border: "1px solid #d1d5db",
										borderRadius: 10,
										padding: "10px 12px",
										resize: "vertical",
									}}
								/>
							</label>

							<label style={{ display: "grid", gap: 6 }}>
								<span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Bot reply</span>
								<textarea
									value={selectedNode.data?.botReply ?? ""}
									onChange={(e) => updateSelectedNodeData({ botReply: e.target.value })}
									rows={5}
									style={{
										border: "1px solid #d1d5db",
										borderRadius: 10,
										padding: "10px 12px",
										resize: "vertical",
									}}
								/>
							</label>

							<div style={{ marginTop: 2, color: "#6b7280", fontSize: 12, lineHeight: 1.4 }}>
								Connect nodes by dragging from the bottom handle to another node’s top handle.
							</div>
						</div>
					) : selectedEdge ? (
						<div style={{ color: "#111827", fontSize: 14, lineHeight: 1.5 }}>
							<div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>Selected edge</div>
							<div style={{ fontSize: 13, marginBottom: 10 }}>
								From <strong>{selectedEdge.source}</strong> → <strong>{selectedEdge.target}</strong>
							</div>
							<button
								type="button"
								onClick={deleteSelectedEdge}
								style={{
									background: "#fee2e2",
									color: "#991b1b",
									border: "1px solid #fecaca",
									borderRadius: 10,
									padding: "10px 12px",
									cursor: "pointer",
								}}
							>
								Delete this edge
							</button>
							<div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
								Tip: you can also press Delete/Backspace.
							</div>
						</div>
					) : (
						<div style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.4 }}>
							<div style={{ marginBottom: 8 }}>Select a node (to edit) or an edge (to delete).</div>
							<div style={{ marginBottom: 8 }}>Tip: click “+ Add node”, then click the node.</div>
						</div>
					)}
				</aside>
			</div>

			<div style={{ marginTop: 12, color: "#6b7280", fontSize: 13, lineHeight: 1.4 }}>
				<div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>Notes</div>
				<div>Click a node to select it, then edit its fields on the right.</div>
				<div>Connect nodes by dragging from a node’s bottom handle to another node’s top handle.</div>
			</div>
		</main>
	);
}