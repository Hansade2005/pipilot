-- Allow team members to see profiles of other members in the same organization
CREATE POLICY "Team members can view teammates profiles"
ON profiles
FOR SELECT
USING (
  id IN (
    SELECT tm.user_id FROM team_members tm
    WHERE tm.status = 'active'
    AND tm.organization_id IN (
      SELECT tm2.organization_id FROM team_members tm2
      WHERE tm2.user_id = auth.uid()
      AND tm2.status = 'active'
    )
  )
);
