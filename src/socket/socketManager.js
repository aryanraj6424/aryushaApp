/**
 * socketManager.js — central Socket.IO manager for the backend
 *
 * Stores the `io` instance and exposes helpers for controllers to emit events.
 *
 * Room naming:
 *   vendor:{vendorId}        — vendor-specific events
 *   customer:{customerId}    — customer-specific events
 *   deliveryBoy:{deliveryBoyId} — delivery boy-specific events
 *   admin:global             — all admin events
 *
 * Event naming (snake_case snake-colon style):
 *   order:assigned           — new order assigned to delivery boy
 *   order:accepted           — vendor accepted the order
 *   order:pickedUp           — delivery boy picked up the order
 *   order:onTheWay           — delivery boy is on the way
 *   order:reachedCustomer    — delivery boy reached the customer
 *   order:delivered          — order delivered (OTP verified)
 */

import CustomerOrder from "../customer/models/CustomerOrder.js";

let _io = null;

/** Called once from server.js during startup */
export function initSocket(io) {
  _io = io;

  io.on("connection", (socket) => {
    // Client joins its own room after connecting
    socket.on("join:room", (room) => {
      socket.join(room);
      console.log(`[Socket] ${socket.id} joined room: ${room}`);
    });

    socket.on("leave:room", (room) => {
      socket.leave(room);
    });

    socket.on("customer:location:update", async ({ orderId, lat, lng, accuracy, timestamp }) => {
      if (!orderId) return;

      // Broadcast customer location updates to all listeners in the order room
      io.to(`order:${orderId}`).emit("customer:location:broadcast", {
        lat,
        lng,
        accuracy,
        timestamp: timestamp || Date.now()
      });

      // Save the latest coordinate point to the database
      try {
        await CustomerOrder.findByIdAndUpdate(orderId, {
          $set: {
            customerLiveLocation: {
              lat,
              lng,
              accuracy,
              capturedAt: new Date(timestamp || Date.now())
            },
            locationUnavailable: false
          }
        });
      } catch (err) {
        console.error(`[Socket] Error updating customer live location for order ${orderId}:`, err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] ${socket.id} disconnected`);
    });
  });
}

/** Returns the io instance — use this in controllers */
export function getIO() {
  if (!_io) throw new Error("Socket.IO not initialized. Call initSocket(io) first.");
  return _io;
}

/**
 * Emit a notification event to a specific room.
 * @param {string} room   e.g. "deliveryBoy:abc123"
 * @param {string} event  e.g. "order:assigned"
 * @param {object} data   payload sent to the client
 */
export function emitToRoom(room, event, data) {
  if (!_io) return; // silently skip if socket not ready (e.g. test env)
  _io.to(room).emit(event, data);
}
