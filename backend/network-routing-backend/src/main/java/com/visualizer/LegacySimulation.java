package com.visualizer;

import java.util.*;

final class LegacySimulation {
    static void apply(Topology topology, String algorithm) {
        var nodes = topology.getRouters().keySet().stream().sorted().map(id -> new Simulation.Node(id,false)).toList();
        Map<String,Simulation.Link> links = new TreeMap<>();
        for (Router router:topology.getRouters().values()) for(var edge:router.getNeighbors().entrySet()) {
            String a=router.getName(), b=edge.getKey(); String key=a.compareTo(b)<0?a+"/"+b:b+"/"+a;
            var existing=links.get(key);
            if(existing!=null && existing.cost()!=edge.getValue()) throw new IllegalArgumentException("Conflicting bidirectional link costs.");
            links.put(key,new Simulation.Link(key,a,b,edge.getValue(),false));
        }
        if(nodes.isEmpty())throw new IllegalArgumentException("Provide at least one router.");
        var result=Simulation.run(new Simulation.Network(nodes,new ArrayList<>(links.values())),nodes.get(0).id(),nodes.get(0).id(),algorithm);
        result.tables().forEach((name,rows)-> {
            var table=topology.getRouter(name).getRoutingTable();table.clear();
            rows.forEach(row->table.put(row.destination(),new RoutingEntry(row.destination(),row.nextHop(),row.cost()==null?Integer.MAX_VALUE:row.cost())));
        });
    }
}
