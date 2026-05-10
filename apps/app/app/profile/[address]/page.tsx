import { ProfilePage } from "@/components/platform";

export default async function ProfileAddressRoute({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);

  return <ProfilePage address={decodedAddress} />;
}
