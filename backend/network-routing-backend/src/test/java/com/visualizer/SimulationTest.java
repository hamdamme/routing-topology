package com.visualizer;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SimulationTest {
    private static final List<String> ALGORITHMS=List.of("dijkstra","bf","dv");
    private Simulation.Network network(List<Simulation.Link> links) {
        return new Simulation.Network(List.of(new Simulation.Node("A",false),new Simulation.Node("B",false),new Simulation.Node("C",false),new Simulation.Node("D",false)),links);
    }
    private Simulation.Link link(String a,String b,int cost,boolean disabled){return new Simulation.Link(a+b,a,b,cost,disabled);}
    @Test void findsWeightedRouteAndUnreachableNextHop() {
        var network=network(List.of(link("A","B",2,false),link("B","C",3,false),link("A","C",20,false)));
        for(String algorithm:ALGORITHMS) {
            var result=Simulation.run(network,"A","C",algorithm);
            assertEquals(5,result.cost());assertEquals(List.of("A","B","C"),result.path());
            var unreachable=result.tables().get("A").stream().filter(row->row.destination().equals("D")).findFirst().orElseThrow();
            assertNull(unreachable.cost());assertNull(unreachable.nextHop());
            assertEquals(0,Simulation.run(network,"A","A",algorithm).cost());
            assertEquals(List.of("A"),Simulation.run(network,"A","A",algorithm).path());
            assertTrue(Simulation.run(network,"C","A",algorithm).path().equals(List.of("C","B","A")));
        }
    }
    @Test void failuresRecomputeAndRestorationRecovers() {
        var links=List.of(link("A","B",2,true),link("B","C",3,false),link("A","C",20,false));
        for(String algorithm:ALGORITHMS) {
            assertEquals(20,Simulation.run(network(links),"A","C",algorithm).cost());
            var failedRouter=new Simulation.Network(List.of(new Simulation.Node("A",false),new Simulation.Node("B",true),new Simulation.Node("C",false)),List.of(link("A","B",2,false),link("B","C",3,false)));
            var result=Simulation.run(failedRouter,"A","C",algorithm);
            assertNull(result.cost());assertTrue(result.path().isEmpty());assertFalse(result.tables().containsKey("B"));
            assertThrows(IllegalArgumentException.class,()->Simulation.run(failedRouter,"B","C",algorithm));
            assertEquals(5,Simulation.run(network(List.of(link("A","B",2,false),link("B","C",3,false))),"A","C",algorithm).cost());
        }
    }
    @Test void validatesMalformedNetworks() {
        assertThrows(IllegalArgumentException.class,()->Simulation.run(null,"A","B","dijkstra"));
        for(int cost:List.of(-1,0,10000)) assertThrows(IllegalArgumentException.class,()->Simulation.run(network(List.of(link("A","B",cost,false))),"A","B","dijkstra"));
        assertThrows(IllegalArgumentException.class,()->Simulation.run(network(List.of(link("A","A",1,false))),"A","B","dijkstra"));
        assertThrows(IllegalArgumentException.class,()->Simulation.run(network(List.of(link("A","B",1,false),link("B","A",1,false))),"A","B","dijkstra"));
        assertThrows(IllegalArgumentException.class,()->Simulation.run(network(List.of(link("A","X",1,false))),"A","B","dijkstra"));
        assertThrows(IllegalArgumentException.class,()->Simulation.run(network(List.of()),"A","B","invalid"));
    }
    @Test void recordsSnapshotsAndSynchronousVectorRounds() {
        var result=Simulation.run(network(List.of(link("A","B",2,false),link("B","C",3,false),link("C","D",4,false))),"A","D","dv");
        assertNull(result.steps().get(0).distances().get("D"));
        assertNull(result.steps().get(1).distances().get("D"));
        assertEquals(9,result.steps().get(2).distances().get("D"));
        assertTrue(result.steps().stream().anyMatch(s->s.message().contains("converged")));
    }
    @Test void matchesIndependentFloydWarshallOnSeededNetworks() {
        Random random=new Random(731);
        for(int example=0;example<25;example++) {
            int size=2+random.nextInt(7);List<Simulation.Node> nodes=new ArrayList<>();List<Simulation.Link> links=new ArrayList<>();
            int[][] costs=new int[size][size];int infinity=1000000;
            for(int i=0;i<size;i++){nodes.add(new Simulation.Node("R"+i,false));Arrays.fill(costs[i],infinity);costs[i][i]=0;}
            for(int i=0;i<size;i++)for(int j=i+1;j<size;j++)if(random.nextBoolean()) {
                int cost=1+random.nextInt(20);links.add(new Simulation.Link(i+"-"+j,"R"+i,"R"+j,cost,false));costs[i][j]=cost;costs[j][i]=cost;
            }
            for(int k=0;k<size;k++)for(int i=0;i<size;i++)for(int j=0;j<size;j++)costs[i][j]=Math.min(costs[i][j],costs[i][k]+costs[k][j]);
            var network=new Simulation.Network(nodes,links);
            for(String algorithm:ALGORITHMS)for(int src=0;src<size;src++) {
                var result=Simulation.run(network,"R"+src,"R"+(size-1),algorithm);
                for(int target=0;target<size;target++)assertEquals(costs[src][target]==infinity?null:costs[src][target],result.tables().get("R"+src).get(target).cost(),algorithm+" example "+example);
                if(result.cost()!=null) {
                    int total=0;for(int h=1;h<result.path().size();h++){String a=result.path().get(h-1),b=result.path().get(h);total+=links.stream().filter(l->(l.from().equals(a)&&l.to().equals(b))||(l.from().equals(b)&&l.to().equals(a))).findFirst().orElseThrow().cost();}
                    assertEquals(result.cost(),total);assertEquals(new HashSet<>(result.path()).size(),result.path().size());
                }else assertTrue(result.path().isEmpty());
            }
        }
    }
    @Test void legacyParserPreservesAllNeighborsAndRejectsBadInput() throws Exception {
        var topology=Initializer.loadFromString("3\nA: (B, 2), (C, 20)\nB: (A, 2), (C, 3)\nC: (B, 3), (A, 20)");
        assertEquals(2,topology.getRouter("A").getNeighbors().size());new Dijkstra().run(topology);
        assertEquals(5,topology.getRouter("A").getRoutingTable().get("C").getCost());
        assertThrows(IllegalArgumentException.class,()->Initializer.loadFromString("2\nA: garbage\nB:"));
        assertThrows(IllegalArgumentException.class,()->Initializer.loadFromString("2\nA: (B, 2)\nB: (A, 3)"));
        assertThrows(IllegalArgumentException.class,()->Initializer.loadFromString("3\nA: (B, 2)\nB:"));
    }
}
