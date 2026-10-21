package com.visualizer.networkroutingservice;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SimulationApiTest {
    @Autowired MockMvc mvc;
    private String request(int cost){return """
    {"network":{"nodes":[{"id":"A"},{"id":"B"}],"links":[{"id":"AB","from":"A","to":"B","cost":%d}]},"source":"A","destination":"B","algorithm":"dijkstra"}
    """.formatted(cost);}
    @Test void returnsRouteAndTrace() throws Exception {
        mvc.perform(post("/api/simulate").contentType(MediaType.APPLICATION_JSON).content(request(7)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cost").value(7)).andExpect(jsonPath("$.path[1]").value("B")).andExpect(jsonPath("$.steps").isArray());
    }
    @Test void rejectsInvalidCostsWithUsefulMessage() throws Exception {
        mvc.perform(post("/api/simulate").contentType(MediaType.APPLICATION_JSON).content(request(-1)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Link costs must be integers from 1 to 9999."));
    }
    @Test void rejectsMissingNetworkAndMalformedJson() throws Exception {
        mvc.perform(post("/api/simulate").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/simulate").contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest());
    }
    @Test void rejectsFractionalLinkCosts() throws Exception {
        mvc.perform(post("/api/simulate").contentType(MediaType.APPLICATION_JSON).content(request(7).replace("\"cost\":7", "\"cost\":7.5")))
                .andExpect(status().isBadRequest());
    }
    @Test void healthEndpointIsAvailable() throws Exception {mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));}
    @Test void legacyEndpointRejectsInvalidRequests() throws Exception {
        for (String body : new String[]{"{}", "{\"algorithm\":null}",
                "{\"algorithm\":\" \"}", "{\"algorithm\":\"dijkstra\"}",
                "{\"algorithm\":\"unknown\",\"config\":\"1\\nA:\"}"}) {
            mvc.perform(post("/api/run").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").isString());
        }
    }
    @Test void legacyEndpointAcceptsSupportedAlgorithms() throws Exception {
        for (String algorithm : new String[]{"dv", "DIJKSTRA", "bf"}) {
            String body = "{\"algorithm\":\"" + algorithm + "\",\"config\":\"2\\nA: (B, 7)\\nB: (A, 7)\"}";
            mvc.perform(post("/api/run").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.tables.A").isArray());
        }
    }
}

