const { z } = require('zod');
const { PHASES, COUNTRIES, RPS_CHOICES } = require('./constants');
const { countryConfig } = require('../config');

const schemas = {
  create_room: z.object({}),
  get_room_list: z.object({}),
  force_close_room: z.object({
    roomId: z.string().length(4),
  }),
  check_room: z.object({
    roomId: z.string().length(4),
    playerName: z.string().min(1).max(20),
  }),
  reclaim_admin: z.object({
    roomId: z.string().length(4),
  }),
  transfer_admin_privileges: z.object({
    roomId: z.string().length(4),
  }),
  register_player: z.object({
    roomId: z.string().length(4),
    country: z.enum(Object.values(COUNTRIES)),
    name: z.string().min(1).max(20),
  }),
  start_phase: z.object({
    roomId: z.string().length(4),
    phase: z.enum(Object.values(PHASES)),
  }),
  production_batch: z.object({
    roomId: z.string().length(4),
    clicks: z.number().int().min(0),
  }),
  trade_selection: z.object({
    roomId: z.string().length(4),
    type: z.enum(['china', 'india', 'none']),
    amount: z.number().int().min(20),
  }),
  make_investment: z.object({
    roomId: z.string().length(4),
    targetCountry: z.enum(Object.keys(COUNTRIES)),
    amount: z.number().int().min(10),
  }),
  play_rps: z.object({
    roomId: z.string().length(4),
    choice: z.enum(Object.values(RPS_CHOICES)),
  }),
  reroll_rps: z.object({
    roomId: z.string().length(4),
  }),
  draw_event: z.object({
    roomId: z.string().length(4),
  }),
  play_final_rps: z.object({
    roomId: z.string().length(4),
    choice: z.enum(Object.values(RPS_CHOICES)),
  }),
  reroll_final_rps: z.object({
    roomId: z.string().length(4),
  }),
  reset_game: z.object({
    roomId: z.string().length(4),
  }),
  end_game: z.object({
    roomId: z.string().length(4),
  }),
  reset_trade: z.object({
    roomId: z.string().length(4),
  }),
  reset_investments: z.object({
    roomId: z.string().length(4),
  }),
  start_timer: z.object({
    roomId: z.string().length(4),
    minutes: z.number().int().min(0),
    seconds: z.number().int().min(0).max(59),
  }),
  stop_timer: z.object({
    roomId: z.string().length(4),
  }),
  reconnect_player: z.object({
    roomId: z.string().length(4),
    token: z.string().uuid(),
  }),
  login_or_register: z.object({
    studentId: z.string().min(1).max(20),
    name: z.string().min(1).max(20),
  }),
  get_users: z.object({}), // New schema for getting all users
  delete_user: z.object({ // New schema for deleting a user
    studentId: z.string().min(1).max(20),
  }),
};

function validate(eventName, data) {
  const schema = schemas[eventName];
  if (!schema) {
    return { error: `Unknown event: ${eventName}` };
  }

  try {
    schema.parse(data);
    return { success: true };
  } catch (error) {
    return { error: error.errors || [{ message: 'Unknown validation error', path: [] }] };
  }
}

module.exports = { validate };
