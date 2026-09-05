import mongoose from "mongoose";

const riderSupportTicketSchema = new mongoose.Schema(
  {
    deliveryBoyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Open", "In_Progress", "Resolved", "Closed"],
      default: "Open",
    },
  },
  { timestamps: true }
);

const RiderSupportTicket =
  mongoose.models.RiderSupportTicket ||
  mongoose.model("RiderSupportTicket", riderSupportTicketSchema);

export default RiderSupportTicket;
