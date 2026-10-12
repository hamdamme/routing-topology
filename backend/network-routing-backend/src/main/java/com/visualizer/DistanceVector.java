package com.visualizer;

public class DistanceVector implements RoutingAlgorithm {
    @Override public void run(Topology topology) {LegacySimulation.apply(topology, "dv");}
}
