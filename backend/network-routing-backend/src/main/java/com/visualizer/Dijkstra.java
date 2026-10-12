package com.visualizer;

public class Dijkstra implements RoutingAlgorithm {
    @Override public void run(Topology topology) {LegacySimulation.apply(topology, "dijkstra");}
}
