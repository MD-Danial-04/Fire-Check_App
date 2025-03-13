CREATE OR REPLACE VIEW public.personnel_ba_view AS
WITH
  ordered_personnel AS (
    SELECT
      va_1.id,
      va_1.personnel_name,
      va_1.vehicle_type,
      va_1.section,
      va_1."position",
      CASE
        WHEN va_1.section = 'COMMAND'::text THEN 0::bigint
        ELSE row_number() OVER (
          PARTITION BY
            va_1.vehicle_type
          ORDER BY
            (
              CASE
                WHEN va_1.section = 'SECTION 1'::text THEN 1
                WHEN va_1.section = 'SECTION 2'::text THEN 2
                WHEN va_1.section = 'SECTION 3'::text THEN 3
                WHEN va_1.section = 'BRIDGE'::text THEN 4
                ELSE 5
              END
            ),
            va_1."position"
        )
      END AS row_number
    FROM
      vehicle_assignments va_1
    WHERE
      (
        va_1.vehicle_type = ANY (ARRAY['MRV811'::text, 'RFV811'::text])
      )
      AND (
        va_1.vehicle_type <> 'RFV811'::text
        OR va_1."position" <> 'OOW'::text
      )
  )
SELECT
  va.id,
  va.personnel_name,
  va.vehicle_type,
  va.section,
  va."position",
  CASE
    WHEN va.vehicle_type = ANY (ARRAY['LF811'::text, 'LF812'::text]) THEN (
      SELECT
        bm.serial_number
      FROM
        ba_master_list bm
      WHERE
        bm.location = ((va.vehicle_type || ' - '::text) || va."position")
      LIMIT
        1
    )
    ELSE NULL::text
  END AS lfav_backplate,
  CASE
    WHEN va.vehicle_type = ANY (ARRAY['LF811'::text, 'LF812'::text]) THEN (
      SELECT
        bm.cylinder_serial
      FROM
        ba_master_list bm
      WHERE
        bm.location = ((va.vehicle_type || ' - '::text) || va."position")
      LIMIT
        1
    )
    ELSE NULL::text
  END AS lfav_cylinder,
  CASE
    WHEN va.section = 'COMMAND'::text THEN (
      SELECT
        bm.serial_number
      FROM
        ba_master_list bm
      WHERE
        bm.location = 'MRV811 - Set 1'::text
      LIMIT
        1
    )
    WHEN va.vehicle_type = 'MRV811'::text AND va."position" <> 'OOW'::text THEN (
      SELECT
        bm.serial_number
      FROM
        ba_master_list bm
        CROSS JOIN ordered_personnel op
      WHERE
        op.id = va.id
        AND bm.location = (
          'MRV811 - Set '::text || ((op.row_number + 1)::text)
        )
      LIMIT
        1
    )
    WHEN va.vehicle_type = 'RFV811'::text
    AND va."position" <> 'OOW'::text THEN (
      SELECT
        bm.serial_number
      FROM
        ba_master_list bm
        CROSS JOIN ordered_personnel op
      WHERE
        op.id = va.id
        AND bm.location = ('RFV811 - Set '::text || op.row_number::text)
      LIMIT
        1
    )
    ELSE NULL::text
  END AS vessel_backplate,
  CASE
    WHEN va.section = 'COMMAND'::text THEN (
      SELECT
        bm.cylinder_serial
      FROM
        ba_master_list bm
      WHERE
        bm.location = 'MRV811 - Set 1'::text
      LIMIT
        1
    )
    WHEN va.vehicle_type = 'MRV811'::text AND va."position" <> 'OOW'::text THEN (
      SELECT
        bm.cylinder_serial
      FROM
        ba_master_list bm
        CROSS JOIN ordered_personnel op
      WHERE
        op.id = va.id
        AND bm.location = (
          'MRV811 - Set '::text || ((op.row_number + 1)::text)
        )
      LIMIT
        1
    )
    WHEN va.vehicle_type = 'RFV811'::text
    AND va."position" <> 'OOW'::text THEN (
      SELECT
        bm.cylinder_serial
      FROM
        ba_master_list bm
        CROSS JOIN ordered_personnel op
      WHERE
        op.id = va.id
        AND bm.location = ('RFV811 - Set '::text || op.row_number::text)
      LIMIT
        1
    )
    ELSE NULL::text
  END AS vessel_cylinder
FROM
  vehicle_assignments va
ORDER BY
  va.section,
  va."position"; 