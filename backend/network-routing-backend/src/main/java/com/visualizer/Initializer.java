package com.visualizer;

import java.io.*;
import java.util.*;
import java.util.regex.*;

public class Initializer {
    public static Topology load(String filepath) throws IOException {try(var reader=new BufferedReader(new FileReader(filepath))){return parse(reader);}}
    public static Topology loadFromString(String text) throws IOException {
        if(text==null || text.length()>30000)throw new IllegalArgumentException("Provide a topology configuration of at most 30000 characters.");
        try(var reader=new BufferedReader(new StringReader(text))){return parse(reader);}
    }
    private static Topology parse(BufferedReader reader) throws IOException {
        var lines=reader.lines().map(String::trim).filter(s->!s.isEmpty()).toList();
        if(lines.isEmpty())throw new IllegalArgumentException("Provide a router count and topology.");
        int count;
        try{count=Integer.parseInt(lines.get(0));}catch(NumberFormatException e){throw new IllegalArgumentException("First line must be the router count.");}
        if(count<1 || count>30)throw new IllegalArgumentException("Use 1–30 routers.");
        Topology topology=new Topology();Set<String> declared=new HashSet<>();
        Pattern row=Pattern.compile("([A-Za-z0-9_-]{1,20})\\s*:\\s*(.*)");
        Pattern pair=Pattern.compile("\\(([A-Za-z0-9_-]{1,20})\\s*,\\s*(\\d+)\\)");
        List<Simulation.Link> links=new ArrayList<>();Map<String,Integer> costs=new TreeMap<>();
        for(int i=1;i<lines.size();i++) {
            var match=row.matcher(lines.get(i));if(!match.matches())throw new IllegalArgumentException("Invalid router line " +(i+1)+".");
            String name=match.group(1);if(!declared.add(name))throw new IllegalArgumentException("Duplicate router declaration.");
            if(topology.getRouter(name)==null)topology.addRouter(new Router(name));
            String rest=match.group(2);int end=0;var neighbors=pair.matcher(rest);
            while(neighbors.find()) {
                String gap=rest.substring(end,neighbors.start()).trim();
                if(end==0?!gap.isEmpty():!gap.equals(","))throw new IllegalArgumentException("Separate neighbors with commas.");
                String to=neighbors.group(1);int cost;
                try{cost=Integer.parseInt(neighbors.group(2));}catch(NumberFormatException e){throw new IllegalArgumentException("Invalid link cost.");}
                String key=name.compareTo(to)<0?name+"/"+to:to+"/"+name;
                if(costs.containsKey(key)&&costs.get(key)!=cost)throw new IllegalArgumentException("Conflicting bidirectional link costs.");
                if(!costs.containsKey(key)){costs.put(key,cost);links.add(new Simulation.Link(key,name,to,cost,false));}
                if(topology.getRouter(to)==null)topology.addRouter(new Router(to));
                topology.getRouter(name).addNeighbor(to,cost);topology.getRouter(to).addNeighbor(name,cost);end=neighbors.end();
            }
            if(!rest.substring(end).trim().isEmpty())throw new IllegalArgumentException("Invalid neighbor list.");
        }
        if(topology.getRouters().size()!=count || declared.size()!=count)throw new IllegalArgumentException("Router count must match all declared routers.");
        Simulation.validate(new Simulation.Network(declared.stream().map(n->new Simulation.Node(n,false)).toList(),links));
        return topology;
    }
}
