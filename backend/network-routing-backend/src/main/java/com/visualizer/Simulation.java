package com.visualizer;

import java.util.*;

/** Deterministic routing analysis for bounded, undirected networks with positive costs. */
public final class Simulation {
    public record Node(String id, boolean disabled) {}
    public record Link(String id, String from, String to, int cost, boolean disabled) {}
    public record Network(List<Node> nodes, List<Link> links) {}
    public record Row(String destination, String nextHop, Integer cost) {}
    public record Step(String message, String from, String to, List<String> visited,
                       Map<String, Integer> distances, int round) {}
    public record Result(String algorithm, List<String> path, Integer cost,
                         Map<String, List<Row>> tables, List<Step> steps,
                         long relaxations, int rounds) {}
    private record QueueEntry(String node, int distance) {}
    private static final int INF = Integer.MAX_VALUE;

    public static Result run(Network network, String source, String destination, String algorithm) {
        var graph = validate(network);
        if (source == null || destination == null || !graph.containsKey(source) || !graph.containsKey(destination))
            throw new IllegalArgumentException("Choose an enabled source and destination router.");
        if (algorithm == null || !List.of("dijkstra", "bf", "dv").contains(algorithm))
            throw new IllegalArgumentException("Unknown routing algorithm.");
        Map<String, List<Row>> tables = new TreeMap<>();
        List<Step> trace = new ArrayList<>();
        long[] attempts = {0};
        int[] rounds = {0};
        Map<String, Integer> selectedDistances;
        if (algorithm.equals("dv")) {
            Map<String, Map<String, Integer>> vectors = new TreeMap<>();
            Map<String, Map<String, String>> hops = new TreeMap<>();
            for (String router : graph.keySet()) {
                var vector = initial(graph.keySet(), router);
                var hop = new TreeMap<String, String>();
                hop.put(router, router);
                graph.get(router).forEach((neighbor, cost) -> {vector.put(neighbor, cost); hop.put(neighbor, neighbor);});
                vectors.put(router, vector); hops.put(router, hop);
            }
            trace.add(step("Initial vectors contain self and directly connected routers.", null, null,
                    List.of(), vectors.get(source), 0));
            for (int round = 1; round <= graph.size(); round++) {
                Map<String, Map<String, Integer>> next = new TreeMap<>();
                boolean changed = false;
                for (String router : graph.keySet()) {
                    var vector = new TreeMap<>(vectors.get(router));
                    for (var neighbor : graph.get(router).entrySet()) {
                        for (String target : graph.keySet()) {
                            attempts[0]++;
                            int candidate = add(neighbor.getValue(), vectors.get(neighbor.getKey()).get(target));
                            if (candidate < vector.get(target)) {
                                vector.put(target, candidate); hops.get(router).put(target, neighbor.getKey()); changed = true;
                            }
                        }
                    }
                    next.put(router, vector);
                }
                vectors = next; rounds[0] = round;
                trace.add(step(changed ? "Round " + round + ": routers learn routes from their neighbors' previous vectors."
                        : "Round " + round + ": no costs changed; the network has converged.",
                        null, null, List.of(), vectors.get(source), round));
                if (!changed) break;
            }
            for (String router : graph.keySet()) tables.put(router, rows(vectors.get(router), hops.get(router)));
            selectedDistances = vectors.get(source);
        } else {
            selectedDistances = null;
            for (String router : graph.keySet()) {
                var distances = initial(graph.keySet(), router);
                Map<String, String> previous = new TreeMap<>();
                boolean selected = router.equals(source);
                Set<String> visited = new LinkedHashSet<>();
                if (selected) trace.add(step("Start at " + router + "; all other costs are unknown.", null, null, visited, distances, 0));
                if (algorithm.equals("dijkstra")) {
                    var queue = new PriorityQueue<QueueEntry>(Comparator.comparingInt(QueueEntry::distance).thenComparing(QueueEntry::node));
                    queue.add(new QueueEntry(router, 0));
                    while (!queue.isEmpty()) {
                        var current = queue.remove(); String u = current.node();
                        if (current.distance() != distances.get(u) || !visited.add(u)) continue;
                        if (selected) trace.add(step("Settle " + u + " at cost " + current.distance() + ".", u, null, visited, distances, 0));
                        for (var edge : graph.get(u).entrySet()) {
                            if (selected) attempts[0]++;
                            int candidate = add(current.distance(), edge.getValue());
                            if (candidate < distances.get(edge.getKey())) {
                                distances.put(edge.getKey(), candidate); previous.put(edge.getKey(), u);
                                queue.add(new QueueEntry(edge.getKey(), candidate));
                                if (selected) trace.add(step("Improve " + edge.getKey() + " through " + u + " to cost " + candidate + ".", u, edge.getKey(), visited, distances, 0));
                            }
                        }
                    }
                } else {
                    for (int round = 1; round < graph.size(); round++) {
                        boolean changed = false;
                        for (String u : graph.keySet()) for (var edge : graph.get(u).entrySet()) {
                            if (selected) attempts[0]++;
                            int candidate = add(distances.get(u), edge.getValue());
                            if (candidate < distances.get(edge.getKey())) {
                                distances.put(edge.getKey(), candidate); previous.put(edge.getKey(), u); changed = true;
                                if (selected) trace.add(step("Pass " + round + ": improve " + edge.getKey() + " through " + u + ".", u, edge.getKey(), visited, distances, round));
                            }
                        }
                        if (selected) {rounds[0] = round; trace.add(step("Pass " + round + (changed ? " completed." : ": no changes; stop."), null, null, visited, distances, round));}
                        if (!changed) break;
                    }
                }
                Map<String, String> hops = new TreeMap<>();
                for (String target : graph.keySet()) {
                    var path = pathFromPrevious(router, target, previous, distances);
                    if (!path.isEmpty()) hops.put(target, path.size() == 1 ? router : path.get(1));
                }
                tables.put(router, rows(distances, hops));
                if (selected) selectedDistances = distances;
            }
        }
        var path = pathFromTables(source, destination, tables);
        trace.add(step(path.isEmpty() ? "Destination is unreachable." : "Route found: " + String.join(" → ", path) + ".", null, null,
                List.of(), selectedDistances, rounds[0]));
        return new Result(algorithm, path, nullable(selectedDistances.get(destination)), tables, trace, attempts[0], rounds[0]);
    }

    public static Map<String, Map<String, Integer>> validate(Network network) {
        if (network == null || network.nodes() == null || network.links() == null)
            throw new IllegalArgumentException("Provide nodes and links.");
        if (network.nodes().isEmpty() || network.nodes().size() > 30 || network.links().size() > 120)
            throw new IllegalArgumentException("Use 1–30 routers and at most 120 links.");
        Map<String, Map<String, Integer>> graph = new TreeMap<>();
        Set<String> all = new HashSet<>(), disabled = new HashSet<>(), ids = new HashSet<>(), pairs = new HashSet<>();
        for (Node node : network.nodes()) {
            if (node == null || node.id() == null || !node.id().matches("[A-Za-z0-9_-]{1,20}") || !all.add(node.id()))
                throw new IllegalArgumentException("Router names must be unique and contain 1–20 letters, digits, underscores or dashes.");
            if (node.disabled()) disabled.add(node.id()); else graph.put(node.id(), new TreeMap<>());
        }
        for (Link link : network.links()) {
            if (link == null || link.id() == null || link.id().isBlank() || link.id().length() > 80 || !ids.add(link.id()))
                throw new IllegalArgumentException("Each link needs a unique identifier.");
            if (!all.contains(link.from()) || !all.contains(link.to()) || link.from().equals(link.to()))
                throw new IllegalArgumentException("Links must connect two distinct existing routers.");
            if (link.cost() < 1 || link.cost() > 9999) throw new IllegalArgumentException("Link costs must be integers from 1 to 9999.");
            String pair = link.from().compareTo(link.to()) < 0 ? link.from()+"/"+link.to() : link.to()+"/"+link.from();
            if (!pairs.add(pair)) throw new IllegalArgumentException("Only one link per router pair is supported.");
            if (!link.disabled() && !disabled.contains(link.from()) && !disabled.contains(link.to())) {
                graph.get(link.from()).put(link.to(), link.cost()); graph.get(link.to()).put(link.from(), link.cost());
            }
        }
        return graph;
    }
    private static int add(int a, int b) {return a == INF || b == INF ? INF : Math.addExact(a,b);}
    private static Integer nullable(int cost) {return cost == INF ? null : cost;}
    private static Map<String,Integer> initial(Set<String> names, String source) {
        Map<String,Integer> distances = new TreeMap<>(); names.forEach(n -> distances.put(n,n.equals(source)?0:INF)); return distances;
    }
    private static Step step(String message, String from, String to, Collection<String> visited, Map<String,Integer> distances, int round) {
        Map<String,Integer> snapshot = new TreeMap<>(); distances.forEach((name,cost) -> snapshot.put(name,nullable(cost)));
        return new Step(message,from,to,List.copyOf(visited),snapshot,round);
    }
    private static List<Row> rows(Map<String,Integer> distances, Map<String,String> hops) {
        return distances.entrySet().stream().map(e -> new Row(e.getKey(),e.getValue()==INF?null:hops.get(e.getKey()),nullable(e.getValue()))).toList();
    }
    private static List<String> pathFromPrevious(String source, String target, Map<String,String> previous, Map<String,Integer> distances) {
        if (distances.get(target)==INF) return List.of();
        LinkedList<String> path=new LinkedList<>(); String current=target;
        while(current!=null && path.size()<=distances.size()) {path.addFirst(current);if(current.equals(source))return path;current=previous.get(current);}
        return List.of();
    }
    private static List<String> pathFromTables(String source, String target, Map<String,List<Row>> tables) {
        List<String> path=new ArrayList<>(); Set<String> seen=new HashSet<>(); String current=source;
        while(current!=null && seen.add(current)) {path.add(current);if(current.equals(target))return path;
            current=tables.get(current).stream().filter(r->r.destination().equals(target)).map(Row::nextHop).filter(Objects::nonNull).findFirst().orElse(null);}
        return List.of();
    }
}

