package com.visualizer.networkroutingservice;

import com.visualizer.Simulation;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SimulationController {
    public record Request(Simulation.Network network, String source, String destination, String algorithm) {}
    @PostMapping("/simulate")
    public Simulation.Result simulate(@RequestBody Request request) {
        return Simulation.run(request.network(), request.source(), request.destination(), request.algorithm());
    }
    @GetMapping("/health") public Map<String,String> health() {return Map.of("status","ok","project","Routing Topology");}
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String,String>> invalid(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(Map.of("message",error.getMessage()));
    }
}
