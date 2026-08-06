import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable uuid-ossp extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // --- users ---
  await knex.schema.createTable('users', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table.varchar('phone', 20).unique().notNullable();
    table.boolean('phone_verified').defaultTo(false);
    table.varchar('email', 255);
    table.varchar('first_name', 100);
    table.varchar('last_name', 100);
    table.text('avatar_url');
    table.varchar('role', 20).notNullable().defaultTo('customer');
    table.varchar('locale', 5).defaultTo('he');
    table.text('push_token');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('phone');
    table.index('role');
  });

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'provider', 'both', 'admin'))
  `);

  // --- addresses ---
  await knex.schema.createTable('addresses', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.varchar('label', 50).defaultTo('home');
    table.text('street').notNullable();
    table.varchar('apartment', 20);
    table.varchar('city', 100).notNullable();
    table.varchar('zip_code', 10);
    table.decimal('lat', 10, 7).notNullable();
    table.decimal('lng', 10, 7).notNullable();
    table.text('instructions');
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('user_id');
  });

  // --- otp_codes ---
  await knex.schema.createTable('otp_codes', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table.varchar('phone', 20).notNullable();
    table.varchar('code', 6).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('used').defaultTo(false);
    table.integer('attempts').defaultTo(0);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['phone', 'created_at']);
  });

  // --- service_categories ---
  await knex.schema.createTable('service_categories', (table) => {
    table.increments('id').primary();
    table.varchar('name_he', 100).notNullable();
    table.varchar('name_en', 100).notNullable();
    table.varchar('slug', 100).unique().notNullable();
    table.varchar('icon', 50);
    table.text('image_url');
    table.integer('sort_order').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // --- providers ---
  await knex.schema.createTable('providers', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('user_id')
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.varchar('display_name', 150).notNullable();
    table.text('bio');
    table.boolean('id_verified').defaultTo(false);
    table.varchar('verification_status', 20).defaultTo('pending');
    table.varchar('stripe_account_id', 100);
    table.boolean('stripe_onboarded').defaultTo(false);
    table.decimal('base_lat', 10, 7);
    table.decimal('base_lng', 10, 7);
    table.decimal('service_radius_km', 5, 2).defaultTo(15.0);
    table.decimal('avg_rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    table.integer('total_bookings').defaultTo(0);
    table.varchar('tier', 20).defaultTo('new');
    table.boolean('is_available').defaultTo(false);
    table.decimal('current_lat', 10, 7);
    table.decimal('current_lng', 10, 7);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('user_id');
    table.index('verification_status');
    table.index('is_available');
  });

  // Index on avg_rating DESC requires raw SQL
  await knex.raw('CREATE INDEX providers_avg_rating_desc ON providers (avg_rating DESC)');

  await knex.raw(`
    ALTER TABLE providers
    ADD CONSTRAINT providers_verification_status_check
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended'))
  `);

  await knex.raw(`
    ALTER TABLE providers
    ADD CONSTRAINT providers_tier_check
    CHECK (tier IN ('new', 'verified', 'top_rated', 'premium'))
  `);

  // --- provider_services ---
  await knex.schema.createTable('provider_services', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('provider_id')
      .references('id')
      .inTable('providers')
      .onDelete('CASCADE');
    table
      .integer('category_id')
      .unsigned()
      .references('id')
      .inTable('service_categories');
    table.varchar('name_he', 150).notNullable();
    table.varchar('name_en', 150);
    table.text('description');
    table.integer('price_cents').notNullable();
    table.integer('duration_minutes').notNullable().defaultTo(60);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('provider_id');
    table.index('category_id');
  });

  // --- portfolio_images ---
  await knex.schema.createTable('portfolio_images', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('provider_id')
      .references('id')
      .inTable('providers')
      .onDelete('CASCADE');
    table.text('image_url').notNullable();
    table.text('thumbnail_url');
    table.text('caption');
    table
      .integer('category_id')
      .unsigned()
      .references('id')
      .inTable('service_categories');
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('provider_id');
  });

  // --- provider_schedules ---
  await knex.schema.createTable('provider_schedules', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('provider_id')
      .references('id')
      .inTable('providers')
      .onDelete('CASCADE');
    table.specificType('day_of_week', 'smallint');
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.unique(['provider_id', 'day_of_week', 'start_time']);

    table.index('provider_id');
  });

  await knex.raw(`
    ALTER TABLE provider_schedules
    ADD CONSTRAINT provider_schedules_day_of_week_check
    CHECK (day_of_week >= 0 AND day_of_week <= 6)
  `);

  // --- provider_blocked_dates ---
  await knex.schema.createTable('provider_blocked_dates', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('provider_id')
      .references('id')
      .inTable('providers')
      .onDelete('CASCADE');
    table.date('blocked_date').notNullable();
    table.text('reason');
    table.unique(['provider_id', 'blocked_date']);
  });

  // --- bookings ---
  await knex.schema.createTable('bookings', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table.varchar('booking_number', 20).unique().notNullable();
    table
      .uuid('customer_id')
      .references('id')
      .inTable('users');
    table
      .uuid('provider_id')
      .references('id')
      .inTable('providers');
    table
      .uuid('service_id')
      .references('id')
      .inTable('provider_services');
    table.varchar('service_name', 150).notNullable();
    table.integer('service_price_cents').notNullable();
    table.integer('service_duration_minutes').notNullable();
    table.varchar('booking_type', 20);
    table.timestamp('scheduled_at', { useTz: true });
    table.timestamp('estimated_arrival', { useTz: true });
    table
      .uuid('address_id')
      .references('id')
      .inTable('addresses');
    table.jsonb('address_snapshot').notNullable();
    table.varchar('status', 30).defaultTo('pending');
    table.timestamp('status_updated_at', { useTz: true });
    table.integer('subtotal_cents').notNullable();
    table.integer('platform_fee_cents').defaultTo(0);
    table.integer('tip_cents').defaultTo(0);
    table.integer('total_cents').notNullable();
    table.varchar('payment_status', 20).defaultTo('pending');
    table.varchar('stripe_payment_intent_id', 100);
    table.text('customer_notes');
    table.text('provider_notes');
    table.text('cancellation_reason');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('customer_id');
    table.index('provider_id');
    table.index('status');
    table.index('booking_number');
  });

  // Index on created_at DESC requires raw SQL
  await knex.raw('CREATE INDEX bookings_created_at_desc ON bookings (created_at DESC)');

  await knex.raw(`
    ALTER TABLE bookings
    ADD CONSTRAINT bookings_booking_type_check
    CHECK (booking_type IN ('on_demand', 'scheduled'))
  `);

  await knex.raw(`
    ALTER TABLE bookings
    ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending', 'accepted', 'provider_en_route', 'arrived', 'in_progress', 'completed', 'cancelled_customer', 'cancelled_provider', 'expired', 'disputed'))
  `);

  await knex.raw(`
    ALTER TABLE bookings
    ADD CONSTRAINT bookings_payment_status_check
    CHECK (payment_status IN ('pending', 'authorized', 'captured', 'refunded', 'failed'))
  `);

  // --- reviews ---
  await knex.schema.createTable('reviews', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('booking_id')
      .unique()
      .references('id')
      .inTable('bookings');
    table
      .uuid('reviewer_id')
      .references('id')
      .inTable('users');
    table
      .uuid('reviewee_id')
      .references('id')
      .inTable('users');
    table.varchar('review_type', 20);
    table.specificType('rating', 'smallint');
    table.text('comment');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('reviewee_id');
  });

  await knex.raw(`
    ALTER TABLE reviews
    ADD CONSTRAINT reviews_review_type_check
    CHECK (review_type IN ('customer_to_provider', 'provider_to_customer'))
  `);

  await knex.raw(`
    ALTER TABLE reviews
    ADD CONSTRAINT reviews_rating_check
    CHECK (rating >= 1 AND rating <= 5)
  `);

  // --- chat_messages ---
  await knex.schema.createTable('chat_messages', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('booking_id')
      .references('id')
      .inTable('bookings')
      .onDelete('CASCADE');
    table
      .uuid('sender_id')
      .references('id')
      .inTable('users');
    table.varchar('message_type', 20).defaultTo('text');
    table.text('content').notNullable();
    table.boolean('is_read').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['booking_id', 'created_at']);
  });

  await knex.raw(`
    ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_message_type_check
    CHECK (message_type IN ('text', 'image', 'system'))
  `);

  // --- payments ---
  await knex.schema.createTable('payments', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('booking_id')
      .references('id')
      .inTable('bookings');
    table.varchar('stripe_payment_intent', 100);
    table.varchar('stripe_charge_id', 100);
    table.integer('amount_cents').notNullable();
    table.integer('platform_fee_cents').notNullable();
    table.integer('provider_payout_cents').notNullable();
    table.integer('tip_cents').defaultTo(0);
    table.varchar('currency', 3).defaultTo('ILS');
    table.varchar('status', 20).defaultTo('pending');
    table.varchar('stripe_transfer_id', 100);
    table.timestamp('paid_out_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('booking_id');
  });

  await knex.raw(`
    ALTER TABLE payments
    ADD CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'))
  `);

  // --- favorites ---
  await knex.schema.createTable('favorites', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('provider_id')
      .references('id')
      .inTable('providers')
      .onDelete('CASCADE');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.unique(['user_id', 'provider_id']);

    table.index('user_id');
  });

  // --- notifications ---
  await knex.schema.createTable('notifications', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('title').notNullable();
    table.text('body').notNullable();
    table.jsonb('data');
    table.boolean('is_read').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id', 'created_at']);
  });

  // Create descending index for notifications
  await knex.raw('CREATE INDEX notifications_user_created_desc ON notifications (user_id, created_at DESC)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('favorites');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('reviews');
  await knex.schema.dropTableIfExists('bookings');
  await knex.schema.dropTableIfExists('provider_blocked_dates');
  await knex.schema.dropTableIfExists('provider_schedules');
  await knex.schema.dropTableIfExists('portfolio_images');
  await knex.schema.dropTableIfExists('provider_services');
  await knex.schema.dropTableIfExists('providers');
  await knex.schema.dropTableIfExists('service_categories');
  await knex.schema.dropTableIfExists('otp_codes');
  await knex.schema.dropTableIfExists('addresses');
  await knex.schema.dropTableIfExists('users');
}
