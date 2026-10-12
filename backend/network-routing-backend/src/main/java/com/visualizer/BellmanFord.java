package com.visualizer;

public class BellmanFord implements RoutingAlgorithm {
    @Override public void run(Topology topology) {LegacySimulation.apply(topology, "bf");}
}
