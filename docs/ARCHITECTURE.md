# Architecture: Floor Plan -> Simulation

The core design goal is to keep venue definition, simulation logic, and rendering independent.

## Pipeline

```text
Floor plan / video / manual drawing
            |
            v
     Venue Model (JSON)
            |
            v
      Navigation Graph
            |
            v
     Simulation Engine
            |
      +-----+-----+
      |           |
      v           v
  2D Canvas    Metrics
      |
      v
 Future 3D renderer
```

## 1. Venue Model

The simulator must NOT hard-code a particular building. A venue is data.

A venue describes:

- floors
- walls / blocked regions
- walkable regions
- doors
- stairs
- entrances / exits
- seating / standing zones
- shoe counters
- shoe-wearing zones
- monk-only paths
- capacities

Initially this is authored manually as JSON. Later a floor-plan editor/importer can produce the same JSON.

## 2. Coordinate system

All venue geometry uses real-world meters.

Example:

```json
{
  "width": 30,
  "height": 20,
  "units": "meters"
}
```

The renderer converts meters to pixels. Simulation behavior remains independent of screen resolution.

## 3. Navigation

V0 can use a navigation grid generated from the venue model.

Each cell is one of:

- walkable
- blocked
- destination
- transition (stairs)

Agents use A* pathfinding to reach destinations.

Later this can evolve to navigation meshes / continuous steering without changing the venue format.

## 4. Agent model

Each attendee has simulation state independent of visualization.

Example states:

```text
ARRIVING
DEPOSITING_SHOES
MOVING_TO_SEAT
SEATED
MOVING_TO_EXIT
QUEUING_FOR_SHOES
RETRIEVING_SHOES
PUTTING_ON_SHOES
EXITING
DONE
```

Possible properties:

```json
{
  "id": 42,
  "floor": "floor-2",
  "x": 12.4,
  "y": 8.1,
  "speed": 1.15,
  "destination": "shoe-counter-a",
  "state": "MOVING_TO_EXIT",
  "shoeToken": "A-042"
}
```

## 5. Event scenarios

Building geometry and event behavior are separate.

For example, the same venue can run:

- Pindapatta
- main-event ingress
- post-event discharge
- evacuation test

Scenario configuration controls attendee counts, arrival distributions, floor filling rules, release schedules, destinations, and service times.

## 6. Simulation engine

The engine advances in fixed simulation ticks.

For each tick:

1. Spawn scheduled attendees.
2. Update agent goals.
3. Calculate/recalculate paths when necessary.
4. Move agents subject to speed and available space.
5. Process queues/service points.
6. Process floor transitions.
7. Record congestion and queue metrics.
8. Remove completed agents.

The engine must not depend on Canvas or Three.js.

## 7. Renderer

V0 uses HTML Canvas.

- circle = attendee
- rectangle/line = wall
- labeled region = service/standing/seating area
- density overlay = congestion

Later, a Three.js renderer can consume exactly the same simulation state.

## 8. Floor-plan ingestion roadmap

### V0

Manual JSON venue definition with a dummy venue.

### V0.5

Browser-based floor-plan editor:

1. upload floor-plan image
2. set scale using two known points
3. trace walls
4. mark doors
5. mark stairs
6. mark zones
7. export venue JSON

### V1+

Semi-automatic extraction from architectural drawings/images can assist tracing, but the generated geometry should be reviewed by a human before simulation.

Video can provide reference for reconstructing a venue, but accurate crowd analysis still benefits from measured dimensions of critical doors, corridors, stairs, and service areas.

## Principle

```text
INPUT FORMAT -> VENUE MODEL -> SIMULATION -> VISUALIZATION
```

Everything downstream consumes the normalized Venue Model. This lets us replace manual JSON with a floor-plan editor, image-assisted extraction, CAD/BIM import, or another importer later without rewriting the simulation engine.
