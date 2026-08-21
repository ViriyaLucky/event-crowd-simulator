# Event Crowd Simulator

Web-based crowd-flow simulator for a multi-floor event venue.

## Goal

Simulate attendee movement through a building, identify congestion and bottlenecks, and compare operational strategies before an event.

## Initial venue model

- Parking lot / tent area
- Floor 1
- Floor 2
- Floor 3
- Floor 4
- Stairs / inter-floor transitions
- Entrances and exits
- Shoe deposit and retrieval area

## Event phases

### 1. Morning Pindapatta

- Parking lot is covered by a tent and carpet.
- Attendees remove shoes.
- Attendees occupy standing positions while preserving corridors for monks.
- After Pindapatta, attendees either leave or move upstairs for the following event.

### 2. Main event ingress

Attendees are directed sequentially:

1. Floor 1
2. Floor 2
3. Floor 3
4. Parking/tent overflow

Before entering, attendees deposit shoes with PICs and receive retrieval cards/tokens.

### 3. Post-event discharge

This is the primary bottleneck scenario.

Attendees from multiple floors move downstairs toward the shoe retrieval area and exit. The simulator should model stairs, queues, shoe retrieval service capacity, shoe-wearing space, and exit flow.

## V0 scope

V0 intentionally prioritizes simulation behavior over visual realism.

- Browser-based
- 2D top-down visualization
- One dot = one attendee
- Multiple floors selectable by tabs
- Configurable attendee counts and floor capacities
- Basic attendee movement
- Pathfinding between zones
- Queue behavior
- Stair transitions
- Shoe deposit/retrieval counters
- Event-end release strategies
- Simulation speed controls
- Basic bottleneck metrics

## Planned evolution

- **V0:** functional 2D crowd simulator
- **V1:** calibrated crowd, queue, and service behavior
- **V2:** optional 3D building visualization
- **V3:** scenario comparison, heatmaps, and event-planning reports

## Design principle

Keep the simulation engine independent from the renderer so the same crowd model can later drive both 2D and 3D visualizations.
