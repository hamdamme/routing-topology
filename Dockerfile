FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/network-routing-frontend/package*.json ./
RUN npm ci
COPY frontend/network-routing-frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY backend/ backend/
COPY --from=frontend /frontend/dist/ backend/network-routing-service/src/main/resources/static/
RUN mvn -B -q -pl backend/network-routing-service -am package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /workspace/backend/network-routing-service/target/*-SNAPSHOT.jar app.jar
ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
EXPOSE 8080
CMD ["sh", "-c", "java -Dserver.port=${PORT:-8080} -jar app.jar"]
