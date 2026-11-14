import BarChart from "../components/BarChart";

const Home: React.FC = () => {
  const data = [50, 120, 80, 150, 200];

  return (
    <div>
      <h1>Simple Bar Chart</h1>
      <BarChart data={data} />
    </div>
  );
};

export default Home;
