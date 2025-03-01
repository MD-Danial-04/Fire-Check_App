drop view if exists personnel_ba_view;

create or replace view personnel_ba_view as
with ordered_personnel as (
  select
    va.id,
    va.personnel_name,
    va.vehicle_type,
    va.section,
    va."position",
    case 
      when va.section = 'COMMAND' then 0
      else row_number() over (
        partition by va.vehicle_type
        order by 
          case
            when va.section = 'SECTION 1' then 1
            when va.section = 'SECTION 2' then 2
            when va.section = 'SECTION 3' then 3
            when va.section = 'BRIDGE' then 4
            else 5
          end,
          va."position"
      )
    end as row_number
  from vehicle_assignments va
  where va.vehicle_type in ('MRV811', 'RFV811')
  and (va.vehicle_type != 'RFV811' or va."position" != 'OOW')
)
select
  va.id,
  va.personnel_name,
  va.vehicle_type,
  va.section,
  va."position",
  -- LFAV BA assignments
  case
    when va.vehicle_type = any (array['LF811'::text, 'LF812'::text]) then (
      select
        bm.serial_number
      from
        ba_master_list bm
      where
        bm.location = ((va.vehicle_type || ' - '::text) || va."position")
      limit 1
    )
    else null::text
  end as lfav_backplate,
  case
    when va.vehicle_type = any (array['LF811'::text, 'LF812'::text]) then (
      select
        bm.cylinder_serial
      from
        ba_master_list bm
      where
        bm.location = ((va.vehicle_type || ' - '::text) || va."position")
      limit 1
    )
    else null::text
  end as lfav_cylinder,
  -- Vessel BA assignments
  case
    -- Duty Officer gets Set 1
    when va.section = 'COMMAND'::text then (
      select bm.serial_number
      from ba_master_list bm
      where bm.location = 'MRV811 - Set 1'
      limit 1
    )
    -- MRV crew gets MRV sets sequentially starting from Set 2
    when va.vehicle_type = 'MRV811'::text then (
      select bm.serial_number
      from ba_master_list bm
      cross join ordered_personnel op
      where op.id = va.id
      and bm.location = 'MRV811 - Set ' || (op.row_number + 1)::text
      limit 1
    )
    -- RFV crew (except OOW) gets RFV sets sequentially
    when va.vehicle_type = 'RFV811'::text and va."position" != 'OOW'::text then (
      select bm.serial_number
      from ba_master_list bm
      cross join ordered_personnel op
      where op.id = va.id
      and bm.location = 'RFV811 - Set ' || (op.row_number)::text
      limit 1
    )
    else null::text
  end as vessel_backplate,
  case
    -- Duty Officer gets Set 1
    when va.section = 'COMMAND'::text then (
      select bm.cylinder_serial
      from ba_master_list bm
      where bm.location = 'MRV811 - Set 1'
      limit 1
    )
    -- MRV crew gets MRV sets sequentially starting from Set 2
    when va.vehicle_type = 'MRV811'::text then (
      select bm.cylinder_serial
      from ba_master_list bm
      cross join ordered_personnel op
      where op.id = va.id
      and bm.location = 'MRV811 - Set ' || (op.row_number + 1)::text
      limit 1
    )
    -- RFV crew (except OOW) gets RFV sets sequentially
    when va.vehicle_type = 'RFV811'::text and va."position" != 'OOW'::text then (
      select bm.cylinder_serial
      from ba_master_list bm
      cross join ordered_personnel op
      where op.id = va.id
      and bm.location = 'RFV811 - Set ' || (op.row_number)::text
      limit 1
    )
    else null::text
  end as vessel_cylinder
from vehicle_assignments va
order by va.section, va."position"; 